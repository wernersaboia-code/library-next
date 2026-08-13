import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;
beforeAll(async () => {
  ctx = await createTestDb();
  const [u] = await ctx.sql`insert into app_users (email) values ('t@b.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

describe('tracking schema', () => {
  it('aceita my_rating entre 1 e 5 e recusa fora do intervalo', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'L', 'L', 4) returning id`;
    expect(b.id).toBeDefined();
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'X', 'X', 9)`).rejects.toThrow(/check/i);
  });

  it('guarda datas de leitura', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, date_started, date_finished)
      values (${userId}, 'D', 'D', '2026-01-01', '2026-02-01') returning id, date_finished`;
    expect(String(b.date_finished)).toContain('2026-02-01');
  });

  it('highlights aceita kind note/quote e recusa outro', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source) values (${userId},'N','N') returning id`;
    await ctx.sql`insert into highlights (user_id, book_id, kind, text_content, note)
      values (${userId}, ${b.id}, 'quote', 'trecho', 'meu comentário')`;
    await expect(ctx.sql`insert into highlights (user_id, book_id, kind)
      values (${userId}, ${b.id}, 'bookmark')`).rejects.toThrow(/check/i);
  });

  it('busca de notas em português continua funcionando', async () => {
    const rows = await ctx.sql`
      select id from highlights
      where search_tsv @@ websearch_to_tsquery('portuguese', 'comentário')`;
    expect(rows.length).toBeGreaterThan(0);
  });
});
