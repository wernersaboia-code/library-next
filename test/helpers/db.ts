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

async function applyMigrations(sql: postgres.Sql, schemaName: string) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const raw = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
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
