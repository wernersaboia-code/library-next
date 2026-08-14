import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();

  const [u] = await ctx.sql`insert into app_users (email) values ('o@x.com') returning id`;
  userId = u.id;

  // 2 possuídos: um lido (100 pág, terminado em 2026), um não lido
  await ctx.sql`
    insert into books (user_id, title, title_source, owned, read_status,
                       num_pages, date_finished)
    values (${userId}, 'Possuido Lido', 'Possuido Lido', true, 'lido', 100, '2026-02-01')`;
  await ctx.sql`
    insert into books (user_id, title, title_source, owned, read_status)
    values (${userId}, 'Possuido Nao Lido', 'Possuido Nao Lido', true, 'não lido')`;
  // 1 NÃO possuído, mas LIDO (200 pág, terminado em 2025) — apagado do Calibre
  await ctx.sql`
    insert into books (user_id, title, title_source, owned, read_status,
                       num_pages, date_finished)
    values (${userId}, 'Sumiu do Calibre', 'Sumiu do Calibre', false, 'lido', 200, '2025-03-01')`;

  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  vi.doMock('@/lib/auth-user', () => ({
    getCurrentUserId: async () => userId,
    AuthError: class extends Error {},
  }));
});
afterAll(() => ctx.cleanup());

describe('filtro de posse no catálogo', () => {
  it('por padrão lista só os possuídos', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {});
    expect(rows).toHaveLength(2);
  });

  it('posse=todos lista tudo', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, { posse: 'todos' });
    expect(rows).toHaveLength(3);
  });

  it('posse=nao-possuidos lista só o que não tenho', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, { posse: 'nao-possuidos' });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Sumiu do Calibre');
  });
});

describe('estatísticas ignoram posse (AD-7)', () => {
  it('apagar do Calibre não apaga o histórico de leitura', async () => {
    const mod = await import('@/app/api/reading/stats/route');
    const res = await mod.GET();
    const body = await res.json();

    // leitura conta TODOS: o lido possuído + o lido que sumiu do Calibre
    expect(body.lidos).toBe(2);
    expect(body.paginasLidas).toBe(300);
    expect(body.porAno).toEqual({ '2025': 1, '2026': 1 });

    // acervo conta só possuídos
    expect(body.totalBooks).toBe(2);
    expect(body.naoLidos).toBe(1);
  });
});
