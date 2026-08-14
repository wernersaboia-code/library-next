CREATE TABLE IF NOT EXISTS "collections" (
  "id"         serial PRIMARY KEY,
  "user_id"    uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- O nome é o único identificador que o dono enxerga: "Terror" e "terror"
-- lado a lado criariam duas estantes que ele acredita ser uma só (AD-8).
CREATE UNIQUE INDEX IF NOT EXISTS "collections_user_name_unique"
  ON "collections" ("user_id", lower("name"));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_collections_user"
  ON "collections" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "book_collections" (
  "book_id"       integer NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "collection_id" integer NOT NULL REFERENCES "collections"("id") ON DELETE CASCADE,
  "added_at"      timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("collection_id", "book_id")
);--> statement-breakpoint

-- A PK composta já indexa (collection_id, book_id); este índice atende o
-- caminho inverso, usado pelas etiquetas na página do livro.
CREATE INDEX IF NOT EXISTS "idx_book_collections_book"
  ON "book_collections" ("book_id");--> statement-breakpoint

ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS collections_owner ON "collections";--> statement-breakpoint
CREATE POLICY collections_owner ON "collections"
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());--> statement-breakpoint

ALTER TABLE "book_collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "book_collections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS book_collections_owner ON "book_collections";--> statement-breakpoint

-- Sem user_id próprio: a posse é herdada, como em book_to_author. Checa os
-- DOIS lados — só a biblioteca deixaria a brecha de vincular livro alheio
-- a uma biblioteca própria (AD-7).
CREATE POLICY book_collections_owner ON "book_collections"
  USING (
    EXISTS (SELECT 1 FROM collections c
            WHERE c.id = book_collections.collection_id
              AND c.user_id = app_current_user_id())
    AND EXISTS (SELECT 1 FROM books b
            WHERE b.id = book_collections.book_id
              AND b.user_id = app_current_user_id()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM collections c
            WHERE c.id = book_collections.collection_id
              AND c.user_id = app_current_user_id())
    AND EXISTS (SELECT 1 FROM books b
            WHERE b.id = book_collections.book_id
              AND b.user_id = app_current_user_id()));--> statement-breakpoint

-- Grants só em produção (schema public), no mesmo guard da 0007: nos testes
-- cada suíte roda num schema test_* e não deve tocar papéis do cluster.
DO $$
BEGIN
  IF current_schema() = 'public'
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'book_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON collections, book_collections TO book_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE collections_id_seq TO book_app';
  END IF;
END
$$;
