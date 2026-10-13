import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../helpers/db';
import { findDuplicates } from '@/lib/db/duplicates';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@/lib/db/schema';

let ctx: Awaited<ReturnType<typeof createTestDb>> | undefined;
let owner: string;
let legacy: number;
let accented: number;
let sameFile: number;
let otherFile: number;
let database: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  ctx = await createTestDb();
  database = drizzle(ctx.sql, { schema });
  vi.doMock('@/lib/db/drizzle', () => ({ db: database, client: ctx?.sql }));
  const [first, second] = await ctx.sql`insert into app_users (email) values ('import-owner@example.test'), ('import-other@example.test') returning id`;
  owner = first.id;
  const [old] = await ctx.sql`insert into books (user_id, title, title_source, isbn, source) values (${owner}, 'Título diferente', 'Título diferente', '0441013597', 'manual') returning id`;
  legacy = old.id;
  const [accent] = await ctx.sql`insert into books (user_id, title, title_source, source) values (${owner}, 'Coração, Ångström', 'Coração, Ångström', 'manual') returning id`;
  accented = accent.id;
  await ctx.sql`insert into authors (id, name) values ('import-author', 'Cornélia Funke')`;
  await ctx.sql`insert into book_to_author (book_id, author_id) values (${accented}, 'import-author')`;
  const [fileBook] = await ctx.sql`insert into books (user_id, title, title_source, has_file, source) values (${owner}, 'Arquivo renomeado', 'Arquivo renomeado', true, 'manual') returning id`;
  sameFile = fileBook.id;
  await ctx.sql`insert into book_files (book_id, user_id, format, storage_path, mime, size, sha256, has_file) values (${sameFile}, ${owner}, 'epub', 'test/epub', 'application/epub+zip', 100, ${'a'.repeat(64)}, true)`;
  const [otherBook] = await ctx.sql`insert into books (user_id, title, title_source, isbn13, has_file, source) values (${second.id}, 'Coração, Ångström', 'Coração, Ångström', '9780441013593', true, 'manual') returning id`;
  otherFile = otherBook.id;
  await ctx.sql`insert into book_files (book_id, user_id, format, storage_path, mime, size, sha256, has_file) values (${otherBook.id}, ${second.id}, 'epub', 'other/epub', 'application/epub+zip', 100, ${'a'.repeat(64)}, true)`;
});
afterAll(async () => ctx?.cleanup());

describe('consulta de duplicados no Postgres', () => {
  it('encontra ISBN-10 legado mesmo com título diferente e ignora outra conta', async () => {
    if (!ctx) throw new Error('Banco de teste indisponível');
    const rows = await database.transaction((tx) => findDuplicates(tx, owner, { title: '', authors: [], isbn13: '9780441013593', sha256: null }));
    expect(rows.map((row) => [row.id, row.reason])).toEqual([[legacy, 'isbn']]);
  });
  it('normaliza acentos e pontuação na consulta e compara o autor', async () => {
    if (!ctx) throw new Error('Banco de teste indisponível');
    const rows = await database.transaction((tx) => findDuplicates(tx, owner, { title: 'Coracao Angstrom', authors: ['Cornelia Funke'], isbn13: null, sha256: null }));
    expect(rows.map((row) => [row.id, row.reason])).toEqual([[accented, 'titulo-autor']]);
  });
  it('encontra arquivo idêntico somente no acervo do dono', async () => {
    if (!ctx) throw new Error('Banco de teste indisponível');
    const rows = await database.transaction((tx) => findDuplicates(tx, owner, { title: '', authors: [], isbn13: null, sha256: 'a'.repeat(64) }));
    expect(rows.map((row) => [row.id, row.reason])).toEqual([[sameFile, 'arquivo']]);
  });
  it('OPDS lista somente livros do dono e não fornece arquivo de outra conta', async () => {
    const { fetchBookFile, fetchOpdsBooks } = await import('@/lib/opds');
    const books = await fetchOpdsBooks(owner, { limit: 50, offset: 0 });
    expect(books.map((book) => book.id).sort()).toEqual([legacy, accented, sameFile].sort());
    expect(await fetchBookFile(owner, otherFile)).toBeNull();
    expect(await fetchBookFile(owner, sameFile)).toMatchObject({ storagePath: 'test/epub' });
  });
});
