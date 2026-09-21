import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { audioNotes, photos } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { generateUploadUrl } from "../lib/r2.js";
import { triggerPhotoEvent } from "../lib/pusher.js";

const router = Router();

/**
 * GET /api/audio/:photoId
 * Get all audio notes for a photo.
 */
router.get("/:photoId", requireAuth, async (req, res) => {
  const photoId = req.params.photoId as string;

  const notes = await db.query.audioNotes.findMany({
    where: eq(audioNotes.photoId, photoId),
    with: {
      user: true,
    },
    orderBy: (audioNotes, { desc }) => [desc(audioNotes.createdAt)],
  });

  res.json(notes);
});

/**
 * POST /api/audio/generate-url
 * Generate a pre-signed URL for audio upload.
 * Body: { filename, contentType }
 */
router.post("/generate-url", requireAuth, async (req, res) => {
  const { filename, contentType } = req.body;

  if (!filename || !contentType) {
    res
      .status(400)
      .json({ error: "Missing required fields: filename, contentType" });
    return;
  }

  const result = await generateUploadUrl(
    "audio",
    filename,
    contentType || "audio/webm",
  );
  res.json(result);
});

/**
 * POST /api/audio/confirm
 * After successful upload, save the audio note record.
 * Body: { photoId, publicUrl, duration }
 */
router.post("/confirm", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { photoId, publicUrl, duration } = req.body;

  if (!photoId || !publicUrl || duration == null) {
    res
      .status(400)
      .json({ error: "Missing required fields: photoId, publicUrl, duration" });
    return;
  }

  // Verify photo exists
  const photo = await db.query.photos.findFirst({
    where: eq(photos.id, photoId),
  });

  if (!photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }

  const [note] = await db
    .insert(audioNotes)
    .values({
      photoId,
      userId,
      audioUrl: publicUrl,
      duration: Math.min(Math.round(duration), 10),
    })
    .returning();

  const populatedNote = await db.query.audioNotes.findFirst({
    where: eq(audioNotes.id, note.id),
    with: { user: true },
  });

  if (!populatedNote) {
    res.status(500).json({ error: "Failed to fetch saved audio note" });
    return;
  }

  await triggerPhotoEvent(
    photoId,
    "audio:added",
    populatedNote as unknown as Record<string, unknown>,
  );

  res.status(201).json(populatedNote);
});

// // Notify via Pusher
// await triggerPhotoEvent(photoId, 'audio:added', {
//   audioNote: note,
//   userId,
//   albumId: photo.albumId,
// });

// res.status(201).json(note);
// });

/**
 * DELETE /api/audio/:id
 * Delete an audio note (creator only).
 */
router.delete("/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params.id as string;

  const note = await db.query.audioNotes.findFirst({
    where: eq(audioNotes.id, id),
  });

  if (!note) {
    res.status(404).json({ error: "Audio note not found" });
    return;
  }

  if (note.userId !== userId) {
    res.status(403).json({ error: "You can only delete your own audio notes" });
    return;
  }

  await db.delete(audioNotes).where(eq(audioNotes.id, id));
  res.json({ success: true, message: "Audio note deleted" });
});

export default router;
