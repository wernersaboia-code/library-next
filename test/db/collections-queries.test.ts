import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;
let terror: number;
let vazia: number;

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));

  const [u] = await ctx.sql`insert into app_users (email) values ('cq@x.com') returning id`;
  userId = u.id;

  const [t] = await ctx.sql`
    insert into collections (user_id, name) values (${userId}, 'Terror') returning id`;
  terror = t.id;
  const [v] = await ctx.sql`
    insert into collections (user_id, name) values (${userId}, 'Aventura') returning id`;
  vazia = v.id;

  const [possuido] = await ctx.sql`
    insert into books (user_id, title, title_source, owned, read_status)
    values (${userId}, 'It', 'It', true, 'lido') returning id`;
  const [desejado] = await ctx.sql`
    insert into books (user_id, title, title_source, source, owned)
    values (${userId}, 'Carrie', 'Carrie', 'manual', false) returning id`;

  await ctx.sql`
    insert into book_collections (book_id, collection_id)
    values (${possuido.id}, ${terror})`;
  await ctx.sql`
    insert into book_collections (book_id, collection_id)
    values (${desejado.id}, ${terror})`;
});
afterAll(() => ctx.cleanup());

describe('fetchCollections', () => {
  it('conta os livros de cada biblioteca e ordena por nome', async () => {
    const { fetchCollections } = await import('@/lib/db/collections');
    const rows = await fetchCollections(userId);
    expect(rows.map((r) => r.name)).toEqual(['Aventura', 'Terror']);
    expect(rows.find((r) => r.name === 'Terror')?.total).toBe(2);
  });

  it('biblioteca sem livros aparece com total zero', async () => {
    const { fetchCollections } = await import('@/lib/db/collections');
    const rows = await fetchCollections(userId);
    expect(rows.find((r) => r.id === vazia)?.total).toBe(0);
  });
});

describe('fetchCollection', () => {
  it('devolve a biblioteca pelo id', async () => {
    const { fetchCollection } = await import('@/lib/db/collections');
    expect((await fetchCollection(userId, terror))?.name).toBe('Terror');
  });

  it('devolve undefined para id inexistente', async () => {
    const { fetchCollection } = await import('@/lib/db/collections');
    expect(await fetchCollection(userId, 999999)).toBeUndefined();
  });
});

describe('fetchCollectionBooks', () => {
  it('devolve os livros com o campo owned, para o selo "Quero ter" (AD-3)', async () => {
    const { fetchCollectionBooks } = await import('@/lib/db/collections');
    const livros = await fetchCollectionBooks(userId, terror);
    expect(livros).toHaveLength(2);
    expect(livros.find((l) => l.title === 'It')?.owned).toBe(true);
    expect(livros.find((l) => l.title === 'Carrie')?.owned).toBe(false);
  });

  it('traz o status de leitura para as marcações da capa', async () => {
    const { fetchCollectionBooks } = await import('@/lib/db/collections');
    const livros = await fetchCollectionBooks(userId, terror);
    expect(livros.find((l) => l.title === 'It')?.read_status).toBe('lido');
  });

  it('biblioteca vazia devolve lista vazia', async () => {
    const { fetchCollectionBooks } = await import('@/lib/db/collections');
    expect(await fetchCollectionBooks(userId, vazia)).toEqual([]);
  });
});

describe('filtro do catálogo por biblioteca', () => {
  it('devolve só os livros vinculados', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {
      bib: String(terror), posse: 'todos',
    });
    expect(rows.map((r) => r.title).sort()).toEqual(['Carrie', 'It']);
  });

  it('combina com os filtros existentes', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {
      bib: String(terror), status: 'lido', posse: 'todos',
    });
    expect(rows.map((r) => r.title)).toEqual(['It']);
  });

  it('biblioteca vazia devolve nada', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {
      bib: String(vazia), posse: 'todos',
    });
    expect(rows).toEqual([]);
  });

  it('bib não numérico é ignorado em vez de quebrar a página', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {
      bib: 'abc', posse: 'todos',
    });
    expect(rows.length).toBeGreaterThan(0);
  });
});
