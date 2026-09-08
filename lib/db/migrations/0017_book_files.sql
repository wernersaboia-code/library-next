-- Leitura em página: intenção e disponibilidade ficam no livro; o arquivo
-- (EPUB/PDF) é carregado sob demanda no Supabase Storage.
--
-- `books.ready_to_read`: marcado no app ("Preparar para leitura").
-- `books.has_file`: o comando local `db:sync-files` já subiu o arquivo.
-- `book_files`: metadados do arquivo no bucket privado `book-files`.
ALTER TABLE "books" ADD COLUMN "ready_to_read" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "has_file" boolean NOT NULL DEFAULT false;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "book_files" (
  "id" serial PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "book_id" integer NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "format" text NOT NULL,
  "storage_path" text NOT NULL,
  "mime" text NOT NULL,
  "size" bigint NOT NULL,
  "sha256" text,
  "has_file" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "book_files" ADD CONSTRAINT "book_files_format_check"
  CHECK ("format" IN ('epub', 'pdf'));--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_book_files_book"
  ON "book_files" ("book_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_book_files_user"
  ON "book_files" ("user_id");--> statement-breakpoint

-- Localização do destaque no leitor (CFI do EPUB; página+seleção do PDF).
ALTER TABLE "highlights" ADD COLUMN "locator" jsonb;--> statement-breakpoint

-- RLS: isolamento por usuário, mesmo padrão do 0007.
ALTER TABLE "book_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "book_files" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "book_files_owner" ON "book_files";--> statement-breakpoint
CREATE POLICY "book_files_owner" ON "book_files"
  USING ("user_id" = app_current_user_id())
  WITH CHECK ("user_id" = app_current_user_id());--> statement-breakpoint

-- Grants para o papel da aplicação: só em produção (schema `public`).
-- Mesma guarda do 0007 para não vazar para o cluster dos testes.
DO $$
BEGIN
  IF current_schema() = 'public' THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "book_files" TO book_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE "book_files_id_seq" TO book_app';
  END IF;
END
$$;
