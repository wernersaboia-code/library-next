ALTER TABLE "books" ADD COLUMN "calibre_uuid" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "calibre_modified" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "source" text DEFAULT 'calibre' NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "owned" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_user_owned" ON "books" USING btree ("user_id","owned");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_source_check"
  CHECK ("source" IN ('calibre','manual'));--> statement-breakpoint

-- Parcial: livros manuais (uuid nulo) não competem pela unicidade.
CREATE UNIQUE INDEX "books_user_calibre_uuid_unique"
  ON "books" ("user_id", "calibre_uuid") WHERE "calibre_uuid" IS NOT NULL;--> statement-breakpoint

-- Limpeza única: os registros importados antes do uuid seriam tratados como
-- manuais pelo sync. Seguro porque não há tracking (ver o aviso do plano).
DELETE FROM "books" WHERE "source" = 'calibre' AND "calibre_uuid" IS NULL;