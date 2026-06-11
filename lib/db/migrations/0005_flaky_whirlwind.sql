CREATE TABLE IF NOT EXISTS "annotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"type" text NOT NULL,
	"cfi" text,
	"page" integer,
	"text_content" text,
	"note" text,
	"color" text DEFAULT '#ffff00',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "annotations" ADD CONSTRAINT "annotations_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
