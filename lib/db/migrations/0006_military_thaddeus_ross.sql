CREATE TABLE IF NOT EXISTS "api_usage" (
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_user_id_endpoint_window_start_pk" PRIMARY KEY("user_id","endpoint","window_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "highlights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" integer NOT NULL,
	"kind" text NOT NULL,
	"text_content" text,
	"context_before" text,
	"context_after" text,
	"locator" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"progress" numeric(5, 4),
	"color" text DEFAULT '#ffff00' NOT NULL,
	"note" text,
	"note_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "highlights" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce("text_content", '') || ' ' || coalesce("note", ''))
  ) STORED;
--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_kind_check"
  CHECK ("kind" IN ('highlight','bookmark','note'));
--> statement-breakpoint
DROP TABLE IF EXISTS "annotations";--> statement-breakpoint
ALTER TABLE "books" DROP CONSTRAINT "books_isbn_unique";--> statement-breakpoint
ALTER TABLE "drive_files" DROP CONSTRAINT "drive_files_file_id_unique";--> statement-breakpoint
ALTER TABLE "reading_progress" DROP CONSTRAINT "reading_progress_book_id_unique";--> statement-breakpoint
ALTER TABLE "book_to_author" DROP CONSTRAINT "book_to_author_book_id_books_id_fk";
--> statement-breakpoint
ALTER TABLE "drive_files" DROP CONSTRAINT "drive_files_book_id_books_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_progress" DROP CONSTRAINT "reading_progress_book_id_books_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_sessions" DROP CONSTRAINT "reading_sessions_book_id_books_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_books_title_tsv";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_books_created_at";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_books_isbn";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_books_genre";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_books_read_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_books_series";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_books_id_title_image_url_thumbhash";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_drive_files_book_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_drive_files_file_id";--> statement-breakpoint
ALTER TABLE "books" ALTER COLUMN "read_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "books" DROP COLUMN "title_tsv";--> statement-breakpoint
ALTER TABLE "books" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drive_files" ALTER COLUMN "imported_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drive_settings" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reading_progress" ALTER COLUMN "percentage" SET DATA TYPE numeric(5, 4);--> statement-breakpoint
ALTER TABLE "reading_progress" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reading_sessions" ALTER COLUMN "started_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reading_sessions" ALTER COLUMN "ended_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "title_source" text NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "title_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', "title_source")) STORED;
--> statement-breakpoint
CREATE INDEX "idx_books_title_tsv" ON "books" USING gin ("title_tsv");
--> statement-breakpoint
ALTER TABLE "drive_files" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_files" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "drive_files" ADD COLUMN "cached_path" text;--> statement-breakpoint
ALTER TABLE "drive_settings" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD COLUMN "locator" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD COLUMN "seconds_read" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "highlights" ADD CONSTRAINT "highlights_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "highlights" ADD CONSTRAINT "highlights_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_highlights_search" ON "highlights" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_highlights_user_created" ON "highlights" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_highlights_user_book" ON "highlights" USING btree ("user_id","book_id","progress");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "book_to_author" ADD CONSTRAINT "book_to_author_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "books" ADD CONSTRAINT "books_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drive_settings" ADD CONSTRAINT "drive_settings_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_user_isbn" ON "books" USING btree ("user_id","isbn");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_user_created" ON "books" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_user_status" ON "books" USING btree ("user_id","read_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_user_genre" ON "books" USING btree ("user_id","genre");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_user_series" ON "books" USING btree ("user_id","series");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_files_user_book" ON "drive_files" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_files_user_file" ON "drive_files" USING btree ("user_id","file_id");--> statement-breakpoint
ALTER TABLE "drive_files" DROP COLUMN IF EXISTS "size";--> statement-breakpoint
ALTER TABLE "reading_progress" DROP COLUMN IF EXISTS "cfi";--> statement-breakpoint
ALTER TABLE "reading_progress" DROP COLUMN IF EXISTS "minutes_read";