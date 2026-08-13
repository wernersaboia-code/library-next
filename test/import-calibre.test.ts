import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from './helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(() => ctx.cleanup());

describe('resolveUserId', () => {
  it('casa com a conta app_users já criada pelo login (mesmo id, mesmo e-mail)', async () => {
    vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
    const { resolveUserId } = await import('../lib/db/import-calibre');

    const uid = '22222222-2222-2222-2222-222222222222';
    // Simula o que `ensureAppUser` faz no login: cria a linha com o uid do
    // Supabase Auth.
    await ctx.sql`insert into app_users (id, email) values (${uid}, 'dono@exemplo.com')`;

    const resolved = await resolveUserId('dono@exemplo.com');

    expect(resolved).toBe(uid);
    const rows = await ctx.sql`select id, email from app_users where email = 'dono@exemplo.com'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(uid);
  });

  it('cria a linha quando o e-mail ainda não tem conta', async () => {
    vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
    const { resolveUserId } = await import('../lib/db/import-calibre');

    const resolved = await resolveUserId('novo@exemplo.com');

    expect(typeof resolved).toBe('string');
    const rows = await ctx.sql`select id, email from app_users where email = 'novo@exemplo.com'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(resolved);
  });

  it('rejeita e-mail vazio com mensagem em português', async () => {
    vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
    const { resolveUserId } = await import('../lib/db/import-calibre');

    await expect(resolveUserId('')).rejects.toThrow('Informe o e-mail');
    await expect(resolveUserId('   ')).rejects.toThrow('Informe o e-mail');
  });
});
