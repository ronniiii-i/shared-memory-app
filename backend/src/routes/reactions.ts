import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { reactions, photos } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { triggerPhotoEvent } from '../lib/pusher.js';

const router = Router();

/**
 * GET /api/reactions/:photoId
 * Get all reactions for a photo.
 */
router.get('/:photoId', requireAuth, async (req, res) => {
  const photoId = req.params.photoId as string;

  const photoReactions = await db.query.reactions.findMany({
    where: eq(reactions.photoId, photoId),
    with: {
      user: true,
    },
    orderBy: (reactions, { desc }) => [desc(reactions.createdAt)],
  });

  res.json(photoReactions);
});

/**
 * POST /api/reactions
 * Add a reaction to a photo.
 * Body: { photoId, emoji }
 */
router.post('/', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { photoId, emoji } = req.body;

  if (!photoId || !emoji) {
    res.status(400).json({ error: 'Missing required fields: photoId, emoji' });
    return;
  }

  // Verify photo exists
  const photo = await db.query.photos.findFirst({
    where: eq(photos.id, photoId),
  });

  if (!photo) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }

  // Check if user already reacted with this emoji
  const existing = await db.query.reactions.findFirst({
    where: and(
      eq(reactions.photoId, photoId),
      eq(reactions.userId, userId),
      eq(reactions.emoji, emoji),
    ),
  });

  if (existing) {
    res.status(409).json({ error: 'You already reacted with this emoji' });
    return;
  }

  const [reaction] = await db.insert(reactions).values({
    photoId,
    userId,
    emoji,
  }).returning();

  // Trigger real-time emoji animation via Pusher
  await triggerPhotoEvent(photoId, 'reaction:added', {
    reaction,
    userId,
    emoji,
    albumId: photo.albumId,
  });

  res.status(201).json(reaction);
});

/**
 * DELETE /api/reactions/:id
 * Remove a reaction (only the user who created it).
 */
router.delete('/:id', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params.id as string;

  const reaction = await db.query.reactions.findFirst({
    where: eq(reactions.id, id),
  });

  if (!reaction) {
    res.status(404).json({ error: 'Reaction not found' });
    return;
  }

  if (reaction.userId !== userId) {
    res.status(403).json({ error: 'You can only remove your own reactions' });
    return;
  }

  await db.delete(reactions).where(eq(reactions.id, id));

  // Notify via Pusher
  await triggerPhotoEvent(reaction.photoId, 'reaction:removed', {
    reactionId: id,
    userId,
    emoji: reaction.emoji,
  });

  res.json({ success: true, message: 'Reaction removed' });
});

export default router;
