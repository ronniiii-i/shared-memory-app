import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { albumMembers, scrapbookElements, scrapbooks } from "../db/schema.js";
import { triggerAlbumEvent } from "../lib/pusher.js";

const router = Router();

async function getMembership(albumId: string, userId: string) {
  return db.query.albumMembers.findFirst({
    where: and(
      eq(albumMembers.albumId, albumId),
      eq(albumMembers.userId, userId),
    ),
  });
}

async function getPage(id: string) {
  return db.query.scrapbooks.findFirst({
    where: eq(scrapbooks.id, id),
    with: { elements: true },
  });
}

async function getPageAccess(id: string, userId: string) {
  const page = await getPage(id);
  if (!page) return { page: null, membership: null };
  return { page, membership: await getMembership(page.albumId, userId) };
}

router.get("/album/:albumId", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const albumId = req.params.albumId as string;
  const membership = await getMembership(albumId, userId);
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this album" });
    return;
  }

  const pages = await db.query.scrapbooks.findMany({
    where: eq(scrapbooks.albumId, albumId),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  res.json(pages);
});

router.post("/album/:albumId", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const albumId = req.params.albumId as string;
  const membership = await getMembership(albumId, userId);
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this album" });
    return;
  }

  const title =
    typeof req.body.title === "string" && req.body.title.trim()
      ? req.body.title.trim()
      : "Untitled scrapbook";
  const [page] = await db
    .insert(scrapbooks)
    .values({
      albumId,
      creatorId: userId,
      title,
      template: req.body.template || "blank",
      background: req.body.background || "paper",
    })
    .returning();

  await triggerAlbumEvent(albumId, "scrapbook:created", { scrapbook: page });
  res.status(201).json({ ...page, elements: [] });
});

router.get("/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { page, membership } = await getPageAccess(
    req.params.id as string,
    userId,
  );
  if (!page) {
    res.status(404).json({ error: "Scrapbook not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this album" });
    return;
  }
  res.json(page);
});

router.patch("/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { page, membership } = await getPageAccess(
    req.params.id as string,
    userId,
  );
  if (!page) {
    res.status(404).json({ error: "Scrapbook not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this album" });
    return;
  }
  if (page.isLocked) {
    res.status(423).json({ error: "This scrapbook is locked" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body.title === "string")
    updates.title = req.body.title.trim() || page.title;
  if (typeof req.body.template === "string")
    updates.template = req.body.template;
  if (typeof req.body.background === "string")
    updates.background = req.body.background;

  const [updated] = await db
    .update(scrapbooks)
    .set(updates)
    .where(eq(scrapbooks.id, page.id))
    .returning();
  res.json({ ...updated, elements: page.elements });
});

router.put("/:id/elements", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { page, membership } = await getPageAccess(
    req.params.id as string,
    userId,
  );
  if (!page) {
    res.status(404).json({ error: "Scrapbook not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this album" });
    return;
  }
  if (page.isLocked) {
    res.status(423).json({ error: "This scrapbook is locked" });
    return;
  }
  if (req.body.revision !== page.revision) {
    res
      .status(409)
      .json({ error: "This scrapbook changed since you opened it", page });
    return;
  }
  if (!Array.isArray(req.body.elements)) {
    res.status(400).json({ error: "elements array is required" });
    return;
  }

  await db
    .delete(scrapbookElements)
    .where(eq(scrapbookElements.scrapbookId, page.id));
  if (req.body.elements.length > 0) {
    await db.insert(scrapbookElements).values(
      req.body.elements.map(
        (element: Record<string, unknown>, index: number) => ({
          scrapbookId: page.id,
          photoId: typeof element.photoId === "string" ? element.photoId : null,
          type: typeof element.type === "string" ? element.type : "unknown",
          zIndex: typeof element.zIndex === "number" ? element.zIndex : index,
          locked: element.locked === true,
          properties:
            element.properties && typeof element.properties === "object"
              ? (element.properties as Record<string, unknown>)
              : {},
        }),
      ),
    );
  }

  const [updated] = await db
    .update(scrapbooks)
    .set({ revision: page.revision + 1, updatedAt: new Date() })
    .where(eq(scrapbooks.id, page.id))
    .returning();
  const savedPage = await getPage(page.id);
  await triggerAlbumEvent(page.albumId, "scrapbook:updated", {
    scrapbookId: page.id,
    revision: updated.revision,
  });
  res.json(savedPage);
});

router.patch("/:id/lock", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { page, membership } = await getPageAccess(
    req.params.id as string,
    userId,
  );
  if (!page) {
    res.status(404).json({ error: "Scrapbook not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this album" });
    return;
  }
  if (page.creatorId !== userId && membership.role !== "admin") {
    res
      .status(403)
      .json({
        error: "Only the page creator or an album admin can change the lock",
      });
    return;
  }

  const [updated] = await db
    .update(scrapbooks)
    .set({ isLocked: req.body.isLocked === true, updatedAt: new Date() })
    .where(eq(scrapbooks.id, page.id))
    .returning();
  await triggerAlbumEvent(page.albumId, "scrapbook:lock-changed", {
    scrapbookId: page.id,
    isLocked: updated.isLocked,
  });
  res.json(updated);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { page, membership } = await getPageAccess(
    req.params.id as string,
    userId,
  );
  if (!page) {
    res.status(404).json({ error: "Scrapbook not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this album" });
    return;
  }
  if (page.creatorId !== userId && membership.role !== "admin") {
    res
      .status(403)
      .json({
        error:
          "Only the page creator or an album admin can delete this scrapbook",
      });
    return;
  }

  await db.delete(scrapbooks).where(eq(scrapbooks.id, page.id));
  await triggerAlbumEvent(page.albumId, "scrapbook:deleted", {
    scrapbookId: page.id,
  });
  res.json({ success: true });
});

export default router;
