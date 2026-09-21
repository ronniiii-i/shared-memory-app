CREATE TYPE "public"."member_role" AS ENUM('admin', 'contributor');--> statement-breakpoint
CREATE TABLE "album_members" (
	"album_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'contributor' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_members_album_id_user_id_pk" PRIMARY KEY("album_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"share_code" text NOT NULL,
	"passcode" text,
	"cover_photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "albums_share_code_unique" UNIQUE("share_code")
);
--> statement-breakpoint
CREATE TABLE "audio_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"audio_url" text NOT NULL,
	"duration" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"uploader_id" text NOT NULL,
	"r2_url" text NOT NULL,
	"caption" text,
	"layout_x" integer DEFAULT 0 NOT NULL,
	"layout_y" integer DEFAULT 0 NOT NULL,
	"rotation" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrapbook_elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrapbook_id" uuid NOT NULL,
	"photo_id" uuid,
	"type" text NOT NULL,
	"z_index" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrapbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"creator_id" text NOT NULL,
	"title" text DEFAULT 'Untitled scrapbook' NOT NULL,
	"template" text DEFAULT 'blank' NOT NULL,
	"background" text DEFAULT 'paper' NOT NULL,
	"canvas_width" integer DEFAULT 1200 NOT NULL,
	"canvas_height" integer DEFAULT 800 NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"password_hash" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "album_members" ADD CONSTRAINT "album_members_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_members" ADD CONSTRAINT "album_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_notes" ADD CONSTRAINT "audio_notes_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_notes" ADD CONSTRAINT "audio_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrapbook_elements" ADD CONSTRAINT "scrapbook_elements_scrapbook_id_scrapbooks_id_fk" FOREIGN KEY ("scrapbook_id") REFERENCES "public"."scrapbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrapbook_elements" ADD CONSTRAINT "scrapbook_elements_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD CONSTRAINT "scrapbooks_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD CONSTRAINT "scrapbooks_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "albums_share_code_idx" ON "albums" USING btree ("share_code");--> statement-breakpoint
CREATE INDEX "audio_notes_photo_id_idx" ON "audio_notes" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "photos_album_id_idx" ON "photos" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "reactions_photo_id_idx" ON "reactions" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "scrapbook_elements_scrapbook_id_idx" ON "scrapbook_elements" USING btree ("scrapbook_id");--> statement-breakpoint
CREATE INDEX "scrapbooks_album_id_idx" ON "scrapbooks" USING btree ("album_id");