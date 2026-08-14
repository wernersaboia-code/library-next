import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb } from '../helpers/db';

const MIGRATION = path.join(
  process.cwd(), 'lib/db/migrations/0011_series_index.sql'
);

/**
 * O backfill roda com a tabela vazia quando as migrations são aplicadas no
 * schema de teste. Para exercitar o comando de verdade, lemos o statement do
 * próprio arquivo de migration e rodamos contra linhas no formato antigo —
 * é o mesmo SQL que rodará em produção, não uma cópia parecida.
 */
function statementDeBackfill(): string {
  const raw = fs.readFileSync(MIGRATION, 'utf8');
  const stmt = raw
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .find((s) => /update\s+"books"/i.test(s));
  if (!stmt) throw new Error('statement de backfill não encontrado na migration');
  return stmt;
}

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  const [u] = await ctx.sql`insert into app_users (email) values ('sr@x.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

async function inserir(series: string | null): Promise<number> {
  const [b] = await ctx.sql`
    insert into books (user_id, title, title_source, series)
    values (${userId}, 'L', 'L', ${series}) returning id`;
  return b.id;
}

describe('coluna series_index', () => {
  it('existe e aceita fração (volumes como 1.5)', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, series, series_index)
      values (${userId}, 'Meio', 'Meio', 'Ilium', 1.5)
      returning series, series_index`;
    expect(b.series).toBe('Ilium');
    expect(Number(b.series_index)).toBeCloseTo(1.5);
  });
});

describe('fetchBookById', () => {
  it('devolve a série e o volume para a página do livro', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, series, series_index)
      values (${userId}, 'Endymion', 'Endymion', 'Cantos de Endymion', 3)
      returning id`;
    const { fetchBookById } = await import('@/lib/db/queries');
    const livro = await fetchBookById(userId, String(b.id));
    expect(livro.series).toBe('Cantos de Endymion');
    expect(Number(livro.series_index)).toBe(3);
  });
});

describe('backfill do formato antigo "Nome #índice"', () => {
  it('separa o nome do número do volume', async () => {
    const id = await inserir('Ilium #2');
    await ctx.sql.unsafe(statementDeBackfill());
    const [b] = await ctx.sql`select series, series_index from books where id = ${id}`;
    expect(b.series).toBe('Ilium');
    expect(Number(b.series_index)).toBe(2);
  });

  it('agrupa volumes da mesma série sob um único nome', async () => {
    await inserir('Hyperion Cantos #1');
    await inserir('Hyperion Cantos #2');
    await inserir('Hyperion Cantos #3');
    await ctx.sql.unsafe(statementDeBackfill());
    const rows = await ctx.sql`
      select series, count(*)::int as n from books
      where series = 'Hyperion Cantos' group by series`;
    expect(rows).toHaveLength(1);
    expect(rows[0].n).toBe(3);
  });

  it('preserva série sem número', async () => {
    const id = await inserir('Sem Volume');
    await ctx.sql.unsafe(statementDeBackfill());
    const [b] = await ctx.sql`select series, series_index from books where id = ${id}`;
    expect(b.series).toBe('Sem Volume');
    expect(b.series_index).toBeNull();
  });

  it('entende volume fracionário', async () => {
    const id = await inserir('Entre Livros #1.5');
    await ctx.sql.unsafe(statementDeBackfill());
    const [b] = await ctx.sql`select series, series_index from books where id = ${id}`;
    expect(b.series).toBe('Entre Livros');
    expect(Number(b.series_index)).toBeCloseTo(1.5);
  });

  it('não toca em livro sem série', async () => {
    const id = await inserir(null);
    await ctx.sql.unsafe(statementDeBackfill());
    const [b] = await ctx.sql`select series, series_index from books where id = ${id}`;
    expect(b.series).toBeNull();
    expect(b.series_index).toBeNull();
  });

  it('rodar duas vezes não corrompe o que já foi separado', async () => {
    const id = await inserir('Duas Vezes #4');
    await ctx.sql.unsafe(statementDeBackfill());
    await ctx.sql.unsafe(statementDeBackfill());
    const [b] = await ctx.sql`select series, series_index from books where id = ${id}`;
    expect(b.series).toBe('Duas Vezes');
    expect(Number(b.series_index)).toBe(4);
  });
});
