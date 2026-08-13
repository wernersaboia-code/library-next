DROP INDEX IF EXISTS "idx_highlights_user_book";--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "my_rating" integer;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "date_started" date;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "date_finished" date;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_highlights_user_book" ON "highlights" USING btree ("user_id","book_id");--> statement-breakpoint
ALTER TABLE "highlights" DROP COLUMN IF EXISTS "context_before";--> statement-breakpoint
ALTER TABLE "highlights" DROP COLUMN IF EXISTS "context_after";--> statement-breakpoint
ALTER TABLE "highlights" DROP COLUMN IF EXISTS "locator";--> statement-breakpoint
ALTER TABLE "highlights" DROP COLUMN IF EXISTS "progress";--> statement-breakpoint
ALTER TABLE "highlights" DROP COLUMN IF EXISTS "note_updated_at";--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_my_rating_range"
  CHECK ("my_rating" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "highlights" DROP CONSTRAINT IF EXISTS "highlights_kind_check";--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_kind_check"
  CHECK ("kind" IN ('note','quote'));