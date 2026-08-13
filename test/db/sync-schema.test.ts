import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const [u] = await ctx.sql`insert into app_users (email) values ('s@x.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

describe('schema de sync e posse', () => {
  it('tem defaults compatíveis com o acervo existente', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${userId}, 'L', 'L') returning source, owned`;
    expect(b.source).toBe('calibre');
    expect(b.owned).toBe(true);
  });

  it('recusa source fora de calibre/manual', async () => {
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, source)
      values (${userId}, 'X', 'X', 'kobo')`).rejects.toThrow(/check/i);
  });

  it('impede dois livros com o mesmo calibre_uuid para o mesmo usuário', async () => {
    await ctx.sql`
      insert into books (user_id, title, title_source, calibre_uuid)
      values (${userId}, 'A', 'A', 'uuid-1')`;
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, calibre_uuid)
      values (${userId}, 'B', 'B', 'uuid-1')`).rejects.toThrow(/duplicate key|unique/i);
  });

  it('permite vários livros manuais (calibre_uuid nulo) — índice é parcial', async () => {
    await ctx.sql`
      insert into books (user_id, title, title_source, source, owned)
      values (${userId}, 'M1', 'M1', 'manual', false)`;
    await ctx.sql`
      insert into books (user_id, title, title_source, source, owned)
      values (${userId}, 'M2', 'M2', 'manual', false)`;
    const rows = await ctx.sql`
      select id from books where source = 'manual'`;
    expect(rows).toHaveLength(2);
  });
});
