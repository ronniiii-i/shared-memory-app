import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { albums, albumMembers } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

const router = Router();

/**
 * GET /api/albums
 * List all albums the authenticated user is a member of.
 */
router.get('/', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;

  const memberships = await db.query.albumMembers.findMany({
    where: eq(albumMembers.userId, userId),
    with: {
      album: true,
    },
  });

  const result = memberships.map((m) => ({
    ...m.album,
    role: m.role,
    joinedAt: m.joinedAt,
  }));

  res.json(result);
});

/**
 * GET /api/albums/:id
 * Get a single album by ID with member and photo details.
 */
router.get('/:id', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params.id as string;

  // Check membership
  const membership = await db.query.albumMembers.findFirst({
    where: and(eq(albumMembers.albumId, id), eq(albumMembers.userId, userId)),
  });

  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this album' });
    return;
  }

  const album = await db.query.albums.findFirst({
    where: eq(albums.id, id),
    with: {
      members: {
        with: {
          user: true,
        },
      },
      photos: true,
    },
  });

  if (!album) {
    res.status(404).json({ error: 'Album not found' });
    return;
  }

  res.json({ ...album, currentUserRole: membership.role });
});

/**
 * POST /api/albums
 * Create a new album. The creator becomes the admin.
 * Body: { title, description?, passcode? }
 */
router.post('/', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { title, description, passcode } = req.body;

  if (!title || title.trim().length === 0) {
    res.status(400).json({ error: 'Album title is required' });
    return;
  }

  const shareCode = crypto.randomBytes(4).toString('hex');

  const [album] = await db.insert(albums).values({
    title: title.trim(),
    description: description?.trim() || null,
    shareCode,
    passcode: passcode || null,
  }).returning();

  // Add creator as admin
  await db.insert(albumMembers).values({
    albumId: album.id,
    userId,
    role: 'admin',
  });

  res.status(201).json(album);
});

/**
 * PATCH /api/albums/:id
 * Update album settings (admin only).
 * Body: { title?, description?, passcode? }
 */
router.patch('/:id', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params.id as string;
  const { title, description, passcode } = req.body;

  // Check admin
  const membership = await db.query.albumMembers.findFirst({
    where: and(eq(albumMembers.albumId, id), eq(albumMembers.userId, userId)),
  });

  if (!membership || membership.role !== 'admin') {
    res.status(403).json({ error: 'Only admins can update album settings' });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (passcode !== undefined) updates.passcode = passcode || null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  const [updated] = await db.update(albums).set(updates).where(eq(albums.id, id)).returning();
  res.json(updated);
});

/**
 * DELETE /api/albums/:id
 * Delete an album and all associated data (admin only).
 */
router.delete('/:id', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params.id as string;

  const membership = await db.query.albumMembers.findFirst({
    where: and(eq(albumMembers.albumId, id), eq(albumMembers.userId, userId)),
  });

  if (!membership || membership.role !== 'admin') {
    res.status(403).json({ error: 'Only admins can delete albums' });
    return;
  }

  await db.delete(albums).where(eq(albums.id, id));
  res.json({ success: true, message: 'Album deleted' });
});

/**
 * GET /api/albums/join/:shareCode
 * Look up an album by its share code (public, no auth needed for lookup).
 */
router.get('/join/:shareCode', async (req, res) => {
  const shareCode = req.params.shareCode as string;

  const album = await db.query.albums.findFirst({
    where: eq(albums.shareCode, shareCode),
    columns: {
      id: true,
      title: true,
      description: true,
      coverPhotoUrl: true,
      createdAt: true,
    },
  });

  if (!album) {
    res.status(404).json({ error: 'Album not found' });
    return;
  }

  const fullAlbum = await db.query.albums.findFirst({
    where: eq(albums.shareCode, shareCode),
  });

  res.json({
    ...album,
    requiresPasscode: !!fullAlbum?.passcode,
  });
});

/**
 * POST /api/albums/join/:shareCode
 * Join an album via share code. Body: { passcode? }
 */
router.post('/join/:shareCode', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const shareCode = req.params.shareCode as string;
  const { passcode } = req.body;

  const album = await db.query.albums.findFirst({
    where: eq(albums.shareCode, shareCode),
  });

  if (!album) {
    res.status(404).json({ error: 'Album not found' });
    return;
  }

  // Check passcode if required
  if (album.passcode && album.passcode !== passcode) {
    res.status(403).json({ error: 'Incorrect passcode' });
    return;
  }

  // Check if already a member
  const existing = await db.query.albumMembers.findFirst({
    where: and(eq(albumMembers.albumId, album.id), eq(albumMembers.userId, userId)),
  });

  if (existing) {
    res.json({ success: true, message: 'Already a member', albumId: album.id });
    return;
  }

  // Add as contributor
  await db.insert(albumMembers).values({
    albumId: album.id,
    userId,
    role: 'contributor',
  });

  res.status(201).json({ success: true, message: 'Joined album', albumId: album.id });
});

/**
 * DELETE /api/albums/:id/members/:memberId
 * Remove a member from an album (admin only).
 */
router.delete('/:id/members/:memberId', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params.id as string;
  const memberId = req.params.memberId as string;

  // Check admin
  const membership = await db.query.albumMembers.findFirst({
    where: and(eq(albumMembers.albumId, id), eq(albumMembers.userId, userId)),
  });

  if (!membership || membership.role !== 'admin') {
    res.status(403).json({ error: 'Only admins can remove members' });
    return;
  }

  if (memberId === userId) {
    res.status(400).json({ error: 'Admins cannot remove themselves' });
    return;
  }

  await db.delete(albumMembers).where(
    and(eq(albumMembers.albumId, id), eq(albumMembers.userId, memberId))
  );

  res.json({ success: true, message: 'Member removed' });
});

export default router;
