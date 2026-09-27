import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { albums, albumMembers } from '../db/schema.js';
import { eq, and, ilike, ne } from 'drizzle-orm';
import {
  normalizeShareCode,
  validateShareCode,
  generateShareCode,
  isUniqueViolation,
} from '../lib/shareCode.js';

const router = Router();

/**
 * Share codes are unique across every album in the database, not per user.
 * The `albums.share_code` unique index backs this, but it compares raw text —
 * so a case-insensitive probe is also needed to stop `TRIP26` and `trip26`
 * both existing and shadowing each other on lookup.
 *
 * @param excludeAlbumId - Album being renamed, which may keep its own code.
 * @returns An error message, or null when the code is free.
 */
async function assertShareCodeAvailable(
  code: string,
  excludeAlbumId?: string
): Promise<string | null> {
  const clash = await db.query.albums.findFirst({
    where: excludeAlbumId
      ? and(ilike(albums.shareCode, code), ne(albums.id, excludeAlbumId))
      : ilike(albums.shareCode, code),
    columns: { id: true },
  });

  return clash
    ? 'That code is already taken. Try another one.'
    : null;
}

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
 * Body: { title, description?, passcode?, shareCode? }
 *
 * `shareCode` is optional. When supplied it is normalised, validated and
 * checked for uniqueness across the whole database; when omitted a readable
 * code is generated (retrying on the astronomically unlikely collision).
 */
router.post('/', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { title, description, passcode, shareCode } = req.body;

  if (!title || title.trim().length === 0) {
    res.status(400).json({ error: 'Album title is required' });
    return;
  }

  // Resolve the code first so a bad code fails before anything is written.
  let chosenCode: string;

  if (shareCode !== undefined && shareCode !== null && String(shareCode).trim() !== '') {
    const result = validateShareCode(shareCode);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    const taken = await assertShareCodeAvailable(result.code);
    if (taken) {
      res.status(409).json({ error: taken });
      return;
    }

    chosenCode = result.code;
  } else {
    chosenCode = generateShareCode();
  }

  let album: typeof albums.$inferSelect;

  try {
    [album] = await db.insert(albums).values({
      title: title.trim(),
      description: description?.trim() || null,
      shareCode: chosenCode,
      passcode: passcode || null,
    }).returning();
  } catch (err) {
    // Lost a race for the same code, or the generated one collided.
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: 'That code is already taken. Try another one.' });
      return;
    }
    throw err;
  }

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
 * Body: { title?, description?, passcode?, shareCode? }
 *
 * Changing the share code changes every invite link for this album, so it is
 * treated as an admin-only, uniqueness-checked change like the rest.
 */
router.patch('/:id', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params.id as string;
  const { title, description, passcode, shareCode } = req.body;

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

  if (shareCode !== undefined) {
    const result = validateShareCode(shareCode);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    // The album is excluded from the probe, so re-saving the same code is a
    // no-op rather than a conflict with itself.
    const taken = await assertShareCodeAvailable(result.code, id);
    if (taken) {
      res.status(409).json({ error: taken });
      return;
    }

    updates.shareCode = result.code;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  let updated;
  try {
    [updated] = await db.update(albums).set(updates).where(eq(albums.id, id)).returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: 'That code is already taken. Try another one.' });
      return;
    }
    throw err;
  }

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
 *
 * The incoming code is normalised first so a guest can paste a whole invite
 * link or type it in any case, and matched case-insensitively so codes written
 * before normalisation (lower-case) still resolve.
 */
router.get('/join/:shareCode', async (req, res) => {
  const code = normalizeShareCode(req.params.shareCode);

  if (!code) {
    res.status(404).json({ error: 'Album not found' });
    return;
  }

  const album = await db.query.albums.findFirst({
    where: ilike(albums.shareCode, code),
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
    where: ilike(albums.shareCode, code),
  });

  res.json({
    ...album,
    // Hand back the stored code so the UI echoes exactly what the guest must
    // type, rather than echoing back their own (possibly re-cased) input.
    shareCode: fullAlbum?.shareCode,
    requiresPasscode: !!fullAlbum?.passcode,
  });
});

/**
 * POST /api/albums/join/:shareCode
 * Join an album via share code. Body: { passcode? }
 */
router.post('/join/:shareCode', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const code = normalizeShareCode(req.params.shareCode);
  const { passcode } = req.body;

  if (!code) {
    res.status(404).json({ error: 'Album not found' });
    return;
  }

  const album = await db.query.albums.findFirst({
    where: ilike(albums.shareCode, code),
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
