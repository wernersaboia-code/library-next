import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();

  const [u] = await ctx.sql`insert into app_users (email) values ('w@x.com') returning id`;
  userId = u.id;

  // desejado: manual, não possuído — deve aparecer
  await ctx.sql`
    insert into books (user_id, title, title_source, source, owned)
    values (${userId}, 'Quero Ter', 'Quero Ter', 'manual', false)`;
  // manual mas já possuído — não é desejo, não deve aparecer
  await ctx.sql`
    insert into books (user_id, title, title_source, source, owned)
    values (${userId}, 'Manual Possuido', 'Manual Possuido', 'manual', true)`;
  // do calibre, possuído — não deve aparecer
  await ctx.sql`
    insert into books (user_id, title, title_source, source, owned)
    values (${userId}, 'Do Calibre Possuido', 'Do Calibre Possuido', 'calibre', true)`;
  // do calibre, mas apagado de lá (owned=false) — deliberadamente NÃO entra
  // na lista de desejados; é "tive e não tenho mais", não "quero ter"
  await ctx.sql`
    insert into books (user_id, title, title_source, source, owned)
    values (${userId}, 'Sumiu do Calibre', 'Sumiu do Calibre', 'calibre', false)`;

  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  vi.doMock('@/lib/auth-user', () => ({
    getCurrentUserId: async () => userId,
    AuthError: class extends Error {},
  }));
});
afterAll(() => ctx.cleanup());

describe('fetchWishlist', () => {
  it('lista só livros manuais e não possuídos', async () => {
    const { fetchWishlist } = await import('@/lib/db/queries');
    const rows = await fetchWishlist(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Quero Ter');
  });

  it('ignora livros do Calibre mesmo quando owned=false', async () => {
    const { fetchWishlist } = await import('@/lib/db/queries');
    const rows = await fetchWishlist(userId);
    expect(rows.some((r) => r.title === 'Sumiu do Calibre')).toBe(false);
  });

  it('ignora manuais já possuídos', async () => {
    const { fetchWishlist } = await import('@/lib/db/queries');
    const rows = await fetchWishlist(userId);
    expect(rows.some((r) => r.title === 'Manual Possuido')).toBe(false);
  });
});
