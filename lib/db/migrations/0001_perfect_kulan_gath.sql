CREATE TABLE IF NOT EXISTS "drive_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"file_id" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" text,
	"modified_time" text,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drive_files_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_files_book_id" ON "drive_files" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_files_file_id" ON "drive_files" USING btree ("file_id");