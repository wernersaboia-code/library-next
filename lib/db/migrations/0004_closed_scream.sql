CREATE TABLE IF NOT EXISTS "reading_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_seconds" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_progress" ADD COLUMN "minutes_read" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
