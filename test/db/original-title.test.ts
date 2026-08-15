import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  const [u] = await ctx.sql`
    insert into app_users (email) values ('orig@x.com') returning id`;
  userId = u.id;
  await ctx.sql`
    insert into books (user_id, title, title_source, original_title)
    values (${userId}, 'Duna', 'Duna', 'Dune')`;
});
afterAll(() => ctx.cleanup());

describe('título original', () => {
  it('a migration 0016 cria a coluna e aceita o valor', async () => {
    const rows = await ctx.sql`
      select title, original_title from books where user_id = ${userId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].original_title).toBe('Dune');
  });

  it('fetchBookById devolve original_title', async () => {
    const { fetchBookById } = await import('@/lib/db/queries');
    const rows = await ctx.sql`
      select id from books where user_id = ${userId}`;
    const livro = await fetchBookById(userId, String(rows[0].id));
    expect(livro?.title).toBe('Duna');
    expect(livro?.original_title).toBe('Dune');
  });

  it('aceita nulo quando não informado', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${userId}, 'Sem Original', 'Sem Original') returning original_title`;
    expect(b.original_title).toBeNull();
  });
});
