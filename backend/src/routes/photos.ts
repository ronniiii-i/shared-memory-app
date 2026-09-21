import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { photos, albumMembers } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { triggerAlbumEvent } from "../lib/pusher.js";

const router = Router();

/**
 * GET /api/photos/:id/image
 * Same-origin image proxy for canvas editors. The token may be supplied as
 * a query parameter because browsers cannot attach Authorization to <img>.
 */
router.get("/:id/image", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params.id as string;

  const photo = await db.query.photos.findFirst({ where: eq(photos.id, id) });
  if (!photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }

  const membership = await db.query.albumMembers.findFirst({
    where: and(
      eq(albumMembers.albumId, photo.albumId),
      eq(albumMembers.userId, userId),
    ),
  });
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this album" });
    return;
  }

  const imageResponse = await fetch(photo.r2Url);
  if (!imageResponse.ok || !imageResponse.body) {
    res.status(502).json({ error: "Photo storage is unavailable" });
    return;
  }

  res.setHeader(
    "Content-Type",
    imageResponse.headers.get("content-type") || "image/webp",
  );
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Vary", "Authorization, Cookie");
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  res.send(buffer);
});

/**
 * GET /api/photos/:albumId
 * Get all photos for an album (requires membership).
 */
router.get("/:albumId", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const albumId = req.params.albumId as string;

  // Verify membership
  const membership = await db.query.albumMembers.findFirst({
    where: and(
      eq(albumMembers.albumId, albumId),
      eq(albumMembers.userId, userId),
    ),
  });

  if (!membership) {
    res.status(403).json({ error: "You are not a member of this album" });
    return;
  }

  const albumPhotos = await db.query.photos.findMany({
    where: eq(photos.albumId, albumId),
    with: {
      uploader: true,
      reactions: true,
      audioNotes: {
        with: { user: true },
      },
    },
    orderBy: (photos, { desc }) => [desc(photos.createdAt)],
  });

  res.json(albumPhotos);
});

/**
 * PATCH /api/photos/:id/layout
 * Update a single photo's layout coordinates.
 * Body: { layoutX, layoutY, rotation }
 */
router.patch("/:id/layout", requireAuth, async (req, res) => {
  const { layoutX, layoutY, rotation } = req.body;
  const id = req.params.id as string;

  const [updated] = await db
    .update(photos)
    .set({
      layoutX: layoutX ?? undefined,
      layoutY: layoutY ?? undefined,
      rotation: rotation ?? undefined,
    })
    .where(eq(photos.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }

  // Notify album members
  await triggerAlbumEvent(updated.albumId, "photo:moved", { photo: updated });

  res.json(updated);
});

/**
 * PATCH /api/photos/batch-layout
 * Batch update layout coordinates for multiple photos.
 * Body: { updates: [{ id, layoutX, layoutY, rotation }] }
 */
router.patch("/batch-layout", requireAuth, async (req, res) => {
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: "updates array is required" });
    return;
  }

  const results = [];
  for (const update of updates) {
    const [updated] = await db
      .update(photos)
      .set({
        layoutX: update.layoutX,
        layoutY: update.layoutY,
        rotation: update.rotation,
      })
      .where(eq(photos.id, update.id))
      .returning();

    if (updated) results.push(updated);
  }

  res.json({ updated: results.length, photos: results });
});

/**
 * DELETE /api/photos/:id
 * Delete a photo (uploader or album admin only).
 */
router.delete("/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params.id as string;

  const photo = await db.query.photos.findFirst({
    where: eq(photos.id, id),
  });

  if (!photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }

  const isUploader = photo.uploaderId === userId;
  const membership = await db.query.albumMembers.findFirst({
    where: and(
      eq(albumMembers.albumId, photo.albumId),
      eq(albumMembers.userId, userId),
    ),
  });

  if (!isUploader && (!membership || membership.role !== "admin")) {
    res
      .status(403)
      .json({
        error: "Only the uploader or an album admin can delete this photo",
      });
    return;
  }

  await db.delete(photos).where(eq(photos.id, id));

  // Notify album
  await triggerAlbumEvent(photo.albumId, "photo:removed", { photoId: id });

  res.json({ success: true, message: "Photo deleted" });
});

export default router;
