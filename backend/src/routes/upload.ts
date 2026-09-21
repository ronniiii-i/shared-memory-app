import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { generateUploadUrl } from '../lib/r2.js';
import { db } from '../db/index.js';
import { photos, audioNotes } from '../db/schema.js';
import { triggerAlbumEvent } from '../lib/pusher.js';

const router = Router();

/**
 * POST /api/upload/generate-url
 * Generate a pre-signed R2 upload URL.
 * Body: { folder: 'photos' | 'audio', filename: string, contentType: string }
 * Returns: { uploadUrl, publicUrl, key }
 */
router.post('/generate-url', requireAuth, async (req, res) => {
  const { folder, filename, contentType } = req.body;

  if (!folder || !filename || !contentType) {
    res.status(400).json({ error: 'Missing required fields: folder, filename, contentType' });
    return;
  }

  if (!['photos', 'audio'].includes(folder)) {
    res.status(400).json({ error: 'folder must be "photos" or "audio"' });
    return;
  }

  const result = await generateUploadUrl(folder, filename, contentType);
  res.json(result);
});

/**
 * POST /api/upload/confirm-photo
 * After successful R2 upload, save the photo record to the database.
 * Body: { albumId, publicUrl, caption?, layoutX?, layoutY?, rotation?, width?, height? }
 */
router.post('/confirm-photo', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { albumId, publicUrl, caption, layoutX, layoutY, rotation, width, height } = req.body;

  if (!albumId || !publicUrl) {
    res.status(400).json({ error: 'Missing required fields: albumId, publicUrl' });
    return;
  }

  const [photo] = await db.insert(photos).values({
    albumId,
    uploaderId: userId,
    r2Url: publicUrl,
    caption: caption || null,
    layoutX: layoutX ?? Math.floor(Math.random() * 800) + 50,
    layoutY: layoutY ?? Math.floor(Math.random() * 600) + 50,
    rotation: rotation ?? Math.floor(Math.random() * 30) - 15,
    width: width || 300,
    height: height || 250,
  }).returning();

  // Notify album members via Pusher
  await triggerAlbumEvent(albumId, 'photo:added', {
    photo,
    uploaderId: userId,
  });

  res.status(201).json(photo);
});

/**
 * POST /api/upload/confirm-audio
 * After successful R2 audio upload, save the audio note record.
 * Body: { photoId, publicUrl, duration }
 */
router.post('/confirm-audio', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { photoId, publicUrl, duration } = req.body;

  if (!photoId || !publicUrl || duration == null) {
    res.status(400).json({ error: 'Missing required fields: photoId, publicUrl, duration' });
    return;
  }

  const [audioNote] = await db.insert(audioNotes).values({
    photoId,
    userId,
    audioUrl: publicUrl,
    duration: Math.min(duration, 10), // cap at 10 seconds
  }).returning();

  res.status(201).json(audioNote);
});

export default router;
