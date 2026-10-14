import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>> | undefined;
let ownerId: string;
let otherId: string;
let bookId: number;

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx?.db, client: ctx?.sql }));
  const [owner, other] = await ctx.sql`insert into app_users (email) values ('export-owner@example.test'), ('export-other@example.test') returning id`;
  ownerId = owner.id; otherId = other.id;
  const [book] = await ctx.sql`insert into books (user_id, title, title_source, read_status, my_rating, progress_percent, date_started)
    values (${ownerId}, 'Meu livro', 'manual', 'lendo', 4.5, 42, '2026-10-01') returning id`;
  bookId = book.id;
  const [foreign] = await ctx.sql`insert into books (user_id, title, title_source) values (${otherId}, 'Livro privado', 'manual') returning id`;
  await ctx.sql`insert into authors (id, name) values ('export-z', 'Zélia'), ('export-a', 'Ana')`;
  await ctx.sql`insert into book_to_author (book_id, author_id) values (${bookId}, 'export-z'), (${bookId}, 'export-a')`;
  await ctx.sql`insert into highlights (user_id, book_id, kind, note) values (${ownerId}, ${bookId}, 'note', 'Minha nota'), (${otherId}, ${foreign.id}, 'note', 'Nota privada')`;
  await ctx.sql`insert into saved_searches (user_id, name, query) values (${ownerId}, 'Curtos', 'pgs=200'), (${otherId}, 'Privada', 'lng=en')`;
});
afterAll(async () => ctx?.cleanup());

describe('consultas de exportação e estantes', () => {
  it('exporta somente livros e notas do dono, preservando autores e histórico', async () => {
    const { fetchReadingExport } = await import('@/lib/db/reading-export');
    const data = await fetchReadingExport(ownerId);
    expect(data.books).toHaveLength(1);
    expect(data.books[0]).toMatchObject({ id: bookId, authors: ['Ana', 'Zélia'], progress_percent: 42, my_rating: 4.5, date_started: '2026-10-01' });
    expect(data.notes.map((note) => note.note)).toEqual(['Minha nota']);
    expect((await fetchReadingExport(otherId)).books[0].title).toBe('Livro privado');
  });
  it('lista estantes apenas do dono e impede nomes duplicados por conta', async () => {
    const { fetchSavedSearches } = await import('@/lib/db/saved-searches');
    expect((await fetchSavedSearches(ownerId)).map((entry) => entry.name)).toEqual(['Curtos']);
    if (!ctx) throw new Error('Banco de teste indisponível');
    await expect(ctx.sql`insert into saved_searches (user_id, name, query) values (${ownerId}, 'curtos', 'pgs=100')`).rejects.toThrow(/duplicate|unique/i);
    await expect(ctx.sql`insert into saved_searches (user_id, name, query) values (${otherId}, 'Curtos', 'pgs=100')`).resolves.toBeDefined();
  });
});
