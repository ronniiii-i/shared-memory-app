import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  pgEnum,
  primaryKey,
  index,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Role enum for album members
export const memberRoleEnum = pgEnum("member_role", ["admin", "contributor"]);

// ─── Users ───────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  passwordHash: text("password_hash"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── Albums ──────────────────────────────────────────────────
export const albums = pgTable(
  "albums",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    shareCode: text("share_code").unique().notNull(),
    passcode: text("passcode"),
    coverPhotoUrl: text("cover_photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("albums_share_code_idx").on(table.shareCode)],
);

// ─── Album Members ──────────────────────────────────────────
export const albumMembers = pgTable(
  "album_members",
  {
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("contributor"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.albumId, table.userId] })],
);

// ─── Photos ─────────────────────────────────────────────────
export const photos = pgTable(
  "photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    uploaderId: text("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    r2Url: text("r2_url").notNull(),
    caption: text("caption"),
    layoutX: integer("layout_x").notNull().default(0),
    layoutY: integer("layout_y").notNull().default(0),
    rotation: integer("rotation").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("photos_album_id_idx").on(table.albumId)],
);

// ─── Scrapbook Pages ────────────────────────────────────────
export const scrapbooks = pgTable(
  "scrapbooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled scrapbook"),
    template: text("template").notNull().default("blank"),
    background: text("background").notNull().default("paper"),
    canvasWidth: integer("canvas_width").notNull().default(1200),
    canvasHeight: integer("canvas_height").notNull().default(800),
    isLocked: boolean("is_locked").notNull().default(false),
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("scrapbooks_album_id_idx").on(table.albumId)],
);

export const scrapbookElements = pgTable(
  "scrapbook_elements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scrapbookId: uuid("scrapbook_id")
      .notNull()
      .references(() => scrapbooks.id, { onDelete: "cascade" }),
    photoId: uuid("photo_id").references(() => photos.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    zIndex: integer("z_index").notNull().default(0),
    locked: boolean("locked").notNull().default(false),
    properties: jsonb("properties")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("scrapbook_elements_scrapbook_id_idx").on(table.scrapbookId),
  ],
);

// ─── Reactions ──────────────────────────────────────────────
export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("reactions_photo_id_idx").on(table.photoId)],
);

// ─── Audio Notes ────────────────────────────────────────────
export const audioNotes = pgTable(
  "audio_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    audioUrl: text("audio_url").notNull(),
    duration: integer("duration").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("audio_notes_photo_id_idx").on(table.photoId)],
);

// ═══════════════════════════════════════════════════════════════
// Relations
// ═══════════════════════════════════════════════════════════════

export const usersRelations = relations(users, ({ many }) => ({
  albumMemberships: many(albumMembers),
  uploadedPhotos: many(photos),
  reactions: many(reactions),
  audioNotes: many(audioNotes),
}));

export const albumsRelations = relations(albums, ({ many }) => ({
  members: many(albumMembers),
  photos: many(photos),
  scrapbooks: many(scrapbooks),
}));

export const albumMembersRelations = relations(albumMembers, ({ one }) => ({
  album: one(albums, {
    fields: [albumMembers.albumId],
    references: [albums.id],
  }),
  user: one(users, { fields: [albumMembers.userId], references: [users.id] }),
}));

export const photosRelations = relations(photos, ({ one, many }) => ({
  album: one(albums, { fields: [photos.albumId], references: [albums.id] }),
  uploader: one(users, { fields: [photos.uploaderId], references: [users.id] }),
  reactions: many(reactions),
  audioNotes: many(audioNotes),
  scrapbookElements: many(scrapbookElements),
}));

export const scrapbooksRelations = relations(scrapbooks, ({ one, many }) => ({
  album: one(albums, { fields: [scrapbooks.albumId], references: [albums.id] }),
  creator: one(users, {
    fields: [scrapbooks.creatorId],
    references: [users.id],
  }),
  elements: many(scrapbookElements),
}));

export const scrapbookElementsRelations = relations(
  scrapbookElements,
  ({ one }) => ({
    scrapbook: one(scrapbooks, {
      fields: [scrapbookElements.scrapbookId],
      references: [scrapbooks.id],
    }),
    photo: one(photos, {
      fields: [scrapbookElements.photoId],
      references: [photos.id],
    }),
  }),
);

export const reactionsRelations = relations(reactions, ({ one }) => ({
  photo: one(photos, { fields: [reactions.photoId], references: [photos.id] }),
  user: one(users, { fields: [reactions.userId], references: [users.id] }),
}));

export const audioNotesRelations = relations(audioNotes, ({ one }) => ({
  photo: one(photos, { fields: [audioNotes.photoId], references: [photos.id] }),
  user: one(users, { fields: [audioNotes.userId], references: [users.id] }),
}));
