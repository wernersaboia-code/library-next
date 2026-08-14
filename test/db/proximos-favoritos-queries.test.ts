import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

// As queries usam `withUser`, que abre transação e fixa o usuário na sessão
// para a RLS. Nos testes de banco trocamos por uma passagem direta ao db da
// suíte, que já roda num schema isolado.
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: (tx: unknown) => unknown) =>
    fn((globalThis as unknown as { __testDb: unknown }).__testDb)),
}));

beforeAll(async () => {
  ctx = await createTestDb();
  (globalThis as unknown as { __testDb: unknown }).__testDb = ctx.db;
  const [u] = await ctx.sql`
    insert into app_users (email) values ('estante@teste.com') returning id`;
  userId = u.id;

  await ctx.sql`
    insert into books (user_id, title, title_source, next_up, favorite, read_status, my_rating)
    values
      (${userId}, 'Na fila',      'Na fila',      true,  false, 'não lido', null),
      (${userId}, 'Também fila',  'Também fila',  true,  false, 'não lido', null),
      (${userId}, 'Favorito',     'Favorito',     false, true,  'lido',     4.5),
      (${userId}, 'Comum',        'Comum',        false, false, 'não lido', null)`;
});
afterAll(() => ctx.cleanup());

describe('fetchNextUp', () => {
  it('devolve só os livros marcados como próximos', async () => {
    const { fetchNextUp } = await import('@/lib/db/queries');
    const livros = await fetchNextUp(userId);
    expect(livros.map((l) => l.title).sort()).toEqual(['Na fila', 'Também fila']);
  });
});

describe('fetchFavorites', () => {
  it('devolve só os favoritos, com a nota fracionária', async () => {
    const { fetchFavorites } = await import('@/lib/db/queries');
    const livros = await fetchFavorites(userId);
    expect(livros).toHaveLength(1);
    expect(livros[0].title).toBe('Favorito');
    expect(Number(livros[0].my_rating)).toBe(4.5);
  });
});
