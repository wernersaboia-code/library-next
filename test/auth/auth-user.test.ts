import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(() => ctx.cleanup());

describe('ensureAppUser', () => {
  it('cria a linha app_users com id = uid do Supabase', async () => {
    vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
    const { ensureAppUser } = await import('@/lib/auth-user');
    const uid = '11111111-1111-1111-1111-111111111111';
    await ensureAppUser(uid, 'a@b.com');
    await ensureAppUser(uid, 'a@b.com'); // idempotente
    const rows = await ctx.sql`select id, email from app_users where id = ${uid}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('a@b.com');
  });
});
