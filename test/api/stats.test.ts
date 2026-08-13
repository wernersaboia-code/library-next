import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

// Prova a query real de `porAno` (agrupamento por ano de `date_finished`)
// rodando contra um banco de teste isolado, em vez de mockar `withUser` e
// só checar que ele foi chamado. `db` é redirecionado para o banco de teste
// (mesmo padrão de `test/auth/auth-user.test.ts`); `withUser` roda de
// verdade, então a query passa pela mesma transação que produção usaria.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();

  const [user] = await ctx.sql`
    insert into app_users (email) values ('stats@x.com') returning id`;
  userId = user.id;

  // 2 livros lidos em 2025, 1 lido em 2026, 1 não lido (sem data_finished).
  await ctx.sql`
    insert into books
      (user_id, title, title_source, read_status, date_finished, num_pages)
    values
      (${userId}, 'Livro A', 'Livro A', 'lido', '2025-03-10', 100),
      (${userId}, 'Livro B', 'Livro B', 'lido', '2025-11-20', 150),
      (${userId}, 'Livro C', 'Livro C', 'lido', '2026-01-05', 200),
      (${userId}, 'Livro D', 'Livro D', 'não lido', null, 50)
  `;

  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  vi.doMock('@/lib/auth-user', () => ({
    getCurrentUserId: async () => userId,
    AuthError: class extends Error {},
  }));
});

afterAll(() => ctx.cleanup());

describe('GET /api/reading/stats', () => {
  it('calcula contagens e agrupa lidos por ano de date_finished', async () => {
    const mod = await import('@/app/api/reading/stats/route');
    const res = await mod.GET();

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.totalBooks).toBe(4);
    expect(body.lidos).toBe(3);
    expect(body.naoLidos).toBe(1);
    expect(body.paginasLidas).toBe(450); // 100 + 150 + 200 (só os lidos)
    expect(body.porAno).toEqual({ '2025': 2, '2026': 1 });
  });
});
