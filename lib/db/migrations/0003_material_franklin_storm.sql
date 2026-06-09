CREATE TABLE IF NOT EXISTS "reading_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"cfi" text,
	"percentage" numeric(5, 2),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_book_id_unique" UNIQUE("book_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
