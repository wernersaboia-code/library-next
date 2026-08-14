import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  const [u] = await ctx.sql`insert into app_users (email) values ('cf@x.com') returning id`;
  userId = u.id;
  await ctx.sql`
    insert into books (user_id, title, title_source, image_url, read_status, my_rating)
    values (${userId}, 'Lido e Avaliado', 'Lido e Avaliado', 'https://cdn/a.jpg', 'lido', 4)`;
});
afterAll(() => ctx.cleanup());

describe('campos de marcação chegam na listagem', () => {
  it('fetchBooksWithPagination devolve read_status e my_rating', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].read_status).toBe('lido');
    expect(Number(rows[0].my_rating)).toBe(4);
  });
});
