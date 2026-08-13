import {
  describe, it, expect, beforeAll, afterAll, vi,
} from 'vitest';
import { createTestDb } from '../helpers/db';
import { resolveUserId } from '@/lib/db/import-calibre';

// `resolveUserId` (e o resto de `import-calibre.ts`) fala com o singleton
// `db` de `@/lib/db/drizzle`, que em produção aponta para o schema `public`.
// Cada suíte roda num schema `test_*` isolado (ver test/helpers/db.ts), então
// redirecionamos esse singleton para a conexão da suíte via getter —
// resolvido preguiçosamente, já que `ctx` só existe depois do beforeAll.
const dbHolder: { db: unknown } = { db: undefined };
vi.mock('@/lib/db/drizzle', () => ({
  get db() {
    return dbHolder.db;
  },
  // `client` só é usado por `import-calibre.ts` no `client.end()` do
  // encerramento do script — não é exercitado por estes testes.
  client: { end: vi.fn() },
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  dbHolder.db = ctx.db;
});
afterAll(() => ctx.cleanup());

describe('resolveUserId', () => {
  it('cria o usuário quando não existe', async () => {
    const id = await resolveUserId('novo@x.com');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reaproveita o usuário existente', async () => {
    const a = await resolveUserId('mesmo@x.com');
    const b = await resolveUserId('mesmo@x.com');
    expect(a).toBe(b);
  });

  it('recusa e-mail ausente', async () => {
    await expect(resolveUserId('')).rejects.toThrow(/e-mail/i);
  });
});
