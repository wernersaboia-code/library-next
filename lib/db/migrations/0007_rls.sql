-- Row Level Security: isolamento por usuário.
--
-- Todos os objetos referenciados aqui são NÃO qualificados (sem prefixo
-- `public.`), resolvidos via search_path. Em produção o search_path é
-- `public`; nos testes cada suíte roda num schema `test_*` isolado, com o
-- search_path preso a ele. O reescritor de `test/helpers/db.ts` só troca
-- `"public".` literal — esta migration deliberadamente não depende dele.

-- app_current_user_id(): lê o usuário corrente da sessão. NULL quando não
-- definido (ou vazio) => nenhuma linha casa => RLS falha fechado.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint
-- Tabelas com user_id direto: habilita + força RLS e cria a policy de posse.
-- FORCE garante que nem o dono da tabela escapa da policy (defesa em
-- profundidade; papéis com BYPASSRLS, como o `postgres` administrativo,
-- ainda ignoram RLS — por isso a aplicação usa o papel `book_app`).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'books','drive_files','drive_settings',
    'reading_progress','reading_sessions','highlights','api_usage'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner', t);
    EXECUTE format($f$
      CREATE POLICY %I ON %I
        USING (user_id = app_current_user_id())
        WITH CHECK (user_id = app_current_user_id())
    $f$, t || '_owner', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- book_to_author: não tem user_id; a posse é herdada do livro.
ALTER TABLE book_to_author ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE book_to_author FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS book_to_author_owner ON book_to_author;
--> statement-breakpoint
CREATE POLICY book_to_author_owner ON book_to_author
  USING (EXISTS (
    SELECT 1 FROM books b
    WHERE b.id = book_to_author.book_id
      AND b.user_id = app_current_user_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM books b
    WHERE b.id = book_to_author.book_id
      AND b.user_id = app_current_user_id()));
--> statement-breakpoint
-- authors e app_users são globais/compartilhadas; sem RLS.
-- authors não contém dado pessoal: só id e nome público.

-- Papel da aplicação + grants: SOMENTE em produção (schema `public`).
-- Sem BYPASSRLS, sem ownership de tabela — logo respeita as policies acima.
-- Nos testes cada suíte roda num schema `test_*` isolado; o guard
-- current_schema()='public' impede criar um papel GLOBAL ou conceder grants
-- que vazariam para o cluster gerenciado do usuário. A prova de isolamento
-- nos testes usa um papel escopado à suíte via SET ROLE (ver rls.test.ts).
DO $$
BEGIN
  IF current_schema() = 'public' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'book_app') THEN
      CREATE ROLE book_app LOGIN;
    END IF;
    EXECUTE 'GRANT USAGE ON SCHEMA public TO book_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO book_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO book_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO book_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO book_app';
  END IF;
END
$$;
