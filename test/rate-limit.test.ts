import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from './helpers/db';

// `checkRateLimit` usa `withUser`, que fala com o singleton `db` de
// `@/lib/db/drizzle` (schema `public` em produção). Cada suíte roda num
// schema `test_*` isolado (ver test/helpers/db.ts); redirecionamos o
// singleton para a conexão da suíte via getter, resolvido preguiçosamente
// já que `ctx` só existe depois do beforeAll. Mesmo padrão de
// test/import/epub.test.ts.
const dbHolder: { db: unknown } = { db: undefined };
vi.mock('@/lib/db/drizzle', () => ({
  get db() {
    return dbHolder.db;
  },
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  dbHolder.db = ctx.db;
  const [u] = await ctx.sql`
    insert into app_users (email) values ('r@x.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

describe('checkRateLimit', () => {
  it('permite dentro do limite e decrementa o restante', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit');
    const a = await checkRateLimit(userId, 'translate', 3);
    expect(a).toEqual({ allowed: true, remaining: 2 });
    const b = await checkRateLimit(userId, 'translate', 3);
    expect(b.remaining).toBe(1);
  });

  it('bloqueia ao estourar o limite', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit');
    await checkRateLimit(userId, 'bloq', 1);
    expect((await checkRateLimit(userId, 'bloq', 1)).allowed).toBe(false);
  });

  it('conta por endpoint separadamente', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit');
    await checkRateLimit(userId, 'ep1', 1);
    expect((await checkRateLimit(userId, 'ep2', 1)).allowed).toBe(true);
  });

  it('zera o contador na janela seguinte', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit');
    await checkRateLimit(userId, 'janela', 1);
    await ctx.sql`
      update api_usage set window_start = window_start - interval '2 hours'
      where endpoint = 'janela'`;
    expect((await checkRateLimit(userId, 'janela', 1)).allowed).toBe(true);
  });
});
