import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { requireTestDatabaseUrl } from '../setup';

const MIGRATIONS_DIR = path.join(process.cwd(), 'lib/db/migrations');

// O banco de teste é um projeto Supabase gerenciado: `create database` não é
// permitido (e o schema `public` já é usado por dados reais do usuário).
// Isolamos cada suíte por *schema* dentro do mesmo banco em vez de por
// banco — cada suíte ganha um schema `test_<32 hex>` próprio, com o
// search_path preso a ele, e derruba o schema inteiro (cascade) ao final.
//
// Não usamos `drizzle-orm/postgres-js/migrator` aqui: o drizzle-kit
// qualifica toda foreign key cruzada entre tabelas literalmente como
// "public"."tabela" (schema default de `schema.ts`, que não declara nenhum
// pgSchema custom). Se rodássemos as migrations como estão, as constraints
// do schema isolado apontariam para o `public` real em vez das tabelas
// recém-criadas no schema de teste. Por isso lemos os arquivos .sql
// diretamente e reescrevemos esse qualificador para o schema da suíte
// antes de executar.
export async function createTestDb() {
  const name = `test_${randomUUID().replace(/-/g, '')}`;
  const url = requireTestDatabaseUrl();

  const admin = postgres(url, { max: 1, prepare: false });
  await admin.unsafe(`create schema "${name}"`);
  await admin.end();

  const sql = postgres(url, {
    max: 1,
    prepare: false,
    connection: { search_path: name },
  });
  const db = drizzle(sql);

  await applyMigrations(sql, name);

  return {
    name,
    url,
    db,
    sql,
    async cleanup() {
      await sql.end();
      const a = postgres(url, { max: 1, prepare: false });
      await a.unsafe(`drop schema if exists "${name}" cascade`);
      await a.end();
    },
  };
}

// ATENÇÃO (contrato deste reescritor, ler antes de adicionar migrations):
// A substituição abaixo é deliberadamente literal e cega: ela troca apenas
// a sequência exata `"public".` (aspas duplas + ponto) — o formato que o
// drizzle-kit usa para qualificar FKs entre tabelas nas migrations 0000 a
// 0006. Ela NÃO entende SQL e NÃO diferencia identificador de literal.
//
// Migrations futuras (ex.: Task 4, RLS) que precisem referenciar o schema
// `public` NÃO DEVEM depender deste reescritor. Em particular:
//   - `public.tabela` sem aspas não é substituído (fica apontando pro
//     `public` real, quebrando o isolamento por schema do teste);
//   - a palavra `public` dentro de uma string literal (ex.:
//     `CREATE POLICY ... USING (schema = 'public')`) seria corrompida se
//     algum dia a substituição for generalizada para `public.` sem aspas.
// Objetos criados por `CREATE POLICY`, funções, triggers, etc. devem
// qualificar-se via `search_path` (que já está preso ao schema da suíte,
// veja `createTestDb` acima) em vez de prefixo literal de schema.
async function applyMigrations(sql: postgres.Sql, schemaName: string) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const raw = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // Contrato: substitui apenas `"public".` literal (aspas + ponto).
    // Não generalizar para `public.` sem aspas nem para a palavra
    // "public" isolada — ver aviso acima.
    const rewritten = raw.replaceAll('"public".', `"${schemaName}".`);
    const statements = rewritten
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sql.unsafe(statement);
    }
  }
}
