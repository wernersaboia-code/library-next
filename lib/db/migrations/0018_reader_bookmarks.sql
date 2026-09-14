-- Marcadores de página do leitor e a posição para retomar a leitura.
-- O `locator` é jsonb: EPUB guarda o CFI ({format:'epub', cfi, href}); PDF
-- guarda a página ({format:'pdf', page}).
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "last_locator" jsonb;--> statement-breakpoint

-- O leitor grava destaque com kind='highlight', mas a 0009 só permitia
-- note/quote — o "Destacar" falhava na constraint. Reabre a lista.
ALTER TABLE "highlights" DROP CONSTRAINT IF EXISTS "highlights_kind_check";--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_kind_check"
  CHECK ("kind" IN ('note', 'quote', 'highlight'));--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bookmarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "book_id" integer NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "locator" jsonb NOT NULL,
  "label" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_bookmarks_book" ON "bookmarks" ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookmarks_user" ON "bookmarks" ("user_id");--> statement-breakpoint

-- RLS: isolamento por usuário, mesmo padrão da 0017.
ALTER TABLE "bookmarks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bookmarks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "bookmarks_owner" ON "bookmarks";--> statement-breakpoint
CREATE POLICY "bookmarks_owner" ON "bookmarks"
  USING ("user_id" = app_current_user_id())
  WITH CHECK ("user_id" = app_current_user_id());--> statement-breakpoint

-- Grants para o papel da aplicação: só em produção (schema `public`).
DO $$
BEGIN
  IF current_schema() = 'public' THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "bookmarks" TO book_app';
  END IF;
END
$$;
