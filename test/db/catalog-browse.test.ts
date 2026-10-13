import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>> | undefined;
let userId: string;
let foreignBookId: number;
const saga = 'Saga / 100% & C';

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx?.db, client: ctx?.sql }));
  const [owner, other] = await ctx.sql`insert into app_users (email) values ('browse-owner@example.test'), ('browse-other@example.test') returning id`;
  userId = owner.id;
  await ctx.sql`insert into authors (id, name) values ('alice', 'Alice'), ('bob', 'Bob'), ('private', 'Autor da outra conta'), ('paging', 'Autor paginado')`;
  const fixtures = [
    { title: 'Z volume dez', volume: 10, names: ['alice', 'bob'], owned: true },
    { title: 'A volume dois', volume: 2, names: ['alice'], owned: false },
    { title: 'X intermediário', volume: 2.5, names: ['bob'], owned: true },
    { title: 'B primeiro', volume: 1, names: ['alice'], owned: true },
    { title: 'Sem número', volume: null, names: [], owned: true },
  ];
  for (const [index, fixture] of fixtures.entries()) {
    const [book] = await ctx.sql`insert into books (user_id, title, title_source, series, series_index, owned)
      values (${userId}, ${fixture.title}, ${fixture.title}, ${index === 0 ? ' ' + saga + ' ' : saga}, ${fixture.volume}, ${fixture.owned}) returning id`;
    for (const name of fixture.names) await ctx.sql`insert into book_to_author (book_id, author_id) values (${book.id}, ${name})`;
  }
  const [different] = await ctx.sql`insert into books (user_id, title, title_source, series) values (${userId}, 'Outra série', 'Outra série', 'Saga / 1000 & C') returning id`;
  await ctx.sql`insert into book_to_author (book_id, author_id) values (${different.id}, 'alice')`;
  await ctx.sql`insert into books (user_id, title, title_source, series) values (${userId}, 'Sem série', 'Sem série', '   ')`;
  const [foreign] = await ctx.sql`insert into books (user_id, title, title_source, series) values (${other.id}, 'Privado', 'Privado', ${saga}) returning id`;
  foreignBookId = foreign.id;
  await ctx.sql`insert into book_to_author (book_id, author_id) values (${foreign.id}, 'alice'), (${foreign.id}, 'private')`;
  await ctx.sql`insert into books (user_id, title, title_source, series) values (${other.id}, 'Outra conta', 'Outra conta', 'Série privada')`;
  for (let index = 0; index < 30; index++) {
    const title = `Paginado ${String(index).padStart(2, '0')}`;
    const [book] = await ctx.sql`insert into books (user_id, title, title_source, series, series_index)
      values (${userId}, ${title}, ${title}, 'Longa', ${index}) returning id`;
    await ctx.sql`insert into book_to_author (book_id, author_id) values (${book.id}, 'paging')`;
  }
});
afterAll(async () => ctx?.cleanup());

describe('navegação por autores e séries', () => {
  it('conta os livros de cada autor sem duplicar coautorias nem incluir outra conta', async () => {
    const { fetchCatalogAuthors } = await import('@/lib/db/catalog-browse');
    const authors = await fetchCatalogAuthors(userId);
    expect(authors.find((author) => author.id === 'alice')?.total).toBe(4);
    expect(authors.find((author) => author.id === 'bob')?.total).toBe(2);
    expect(authors.some((author) => author.id === 'private')).toBe(false);
  });
  it('lista também desejados e conserva todos os coautores na página do autor', async () => {
    const { fetchCatalogAuthor, fetchCatalogGroupBooks } = await import('@/lib/db/catalog-browse');
    expect((await fetchCatalogAuthor(userId, 'alice'))?.name).toBe('Alice');
    const books = await fetchCatalogGroupBooks(userId, { authorId: 'alice' }, 1);
    expect(books).toHaveLength(4);
    expect(books.find((book) => book.title === 'A volume dois')?.owned).toBe(false);
    expect(books.find((book) => book.title === 'Z volume dez')?.authors).toEqual(['Alice', 'Bob']);
  });
  it('agrupa séries ignorando apenas espaços externos e preserva caracteres literais', async () => {
    const { fetchCatalogSeries, fetchCatalogSeriesGroup } = await import('@/lib/db/catalog-browse');
    const groups = await fetchCatalogSeries(userId);
    expect(groups.find((group) => group.name === saga)?.total).toBe(5);
    expect(groups.some((group) => !group.name.trim() || group.name === 'Série privada')).toBe(false);
    expect((await fetchCatalogSeriesGroup(userId, saga))?.total).toBe(5);
    expect(await fetchCatalogSeriesGroup(userId, ' ')).toBeUndefined();
  });
  it('ordena os volumes numericamente, incluindo frações, e põe ausentes no final', async () => {
    const { fetchCatalogGroupBooks } = await import('@/lib/db/catalog-browse');
    const books = await fetchCatalogGroupBooks(userId, { series: saga }, 1);
    expect(books.map((book) => book.series_index)).toEqual([1, 2, 2.5, 10, null]);
    expect(books.at(-1)?.authors).toEqual([]);
  });
  it('pagina sem repetir livros ou perder os últimos volumes', async () => {
    const { fetchCatalogGroupBooks } = await import('@/lib/db/catalog-browse');
    for (const scope of [{ series: 'Longa' }, { authorId: 'paging' }]) {
      const first = await fetchCatalogGroupBooks(userId, scope, 1);
      const second = await fetchCatalogGroupBooks(userId, scope, 2);
      expect(first).toHaveLength(28); expect(second).toHaveLength(2);
      expect(new Set([...first, ...second].map((book) => book.id)).size).toBe(30);
    }
  });
  it('não revela autor, série ou ficha que só existem em outra conta', async () => {
    const { fetchCatalogAuthor, fetchCatalogSeriesGroup, fetchCatalogGroupBooks } = await import('@/lib/db/catalog-browse');
    expect(await fetchCatalogAuthor(userId, 'private')).toBeUndefined();
    expect(await fetchCatalogSeriesGroup(userId, 'Série privada')).toBeUndefined();
    expect(await fetchCatalogGroupBooks(userId, { authorId: 'private' }, 1)).toEqual([]);
    const { fetchBookById } = await import('@/lib/db/queries');
    expect(await fetchBookById(userId, String(foreignBookId))).toBeUndefined();
  });
  it('a ficha do livro fornece IDs reais dos autores para os links', async () => {
    const { fetchCatalogGroupBooks } = await import('@/lib/db/catalog-browse');
    const [book] = await fetchCatalogGroupBooks(userId, { authorId: 'bob' }, 1);
    const { fetchBookById } = await import('@/lib/db/queries');
    const details = await fetchBookById(userId, String(book.id));
    expect(details?.authorLinks).toEqual(expect.arrayContaining([{ id: 'bob', name: 'Bob' }]));
  });
});
