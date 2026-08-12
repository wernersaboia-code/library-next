import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';
import { readingProgress } from '@/lib/db/schema';
import { sql as drizzleSql } from 'drizzle-orm';

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => { ctx = await createTestDb(); });
afterAll(async () => { await ctx.cleanup(); });

describe('schema', () => {
  it('cria app_users com email único', async () => {
    await ctx.sql`insert into app_users (email) values ('a@b.com')`;
    await expect(
      ctx.sql`insert into app_users (email) values ('a@b.com')`
    ).rejects.toThrow(/duplicate key/);
  });

  it('gera search_tsv em português a partir de text_content e note', async () => {
    const [u] = await ctx.sql`
      insert into app_users (email) values ('t@b.com') returning id`;
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${u.id}, 'Livro', 'Livro') returning id`;

    await ctx.sql`
      insert into highlights (user_id, book_id, kind, text_content, note)
      values (${u.id}, ${b.id}, 'highlight', 'as leituras de verão', 'meu comentário')`;

    // stemming português: "leitura" encontra "leituras"
    const rows = await ctx.sql`
      select id from highlights
      where search_tsv @@ websearch_to_tsquery('portuguese', 'leitura')`;
    expect(rows).toHaveLength(1);

    // o comentário também é buscável
    const rows2 = await ctx.sql`
      select id from highlights
      where search_tsv @@ websearch_to_tsquery('portuguese', 'comentário')`;
    expect(rows2).toHaveLength(1);
  });

  it('rejeita kind inválido', async () => {
    const [u] = await ctx.sql`
      insert into app_users (email) values ('k@b.com') returning id`;
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${u.id}, 'L', 'L') returning id`;
    await expect(
      ctx.sql`insert into highlights (user_id, book_id, kind)
              values (${u.id}, ${b.id}, 'invalido')`
    ).rejects.toThrow(/check constraint/);
  });

  it('apaga highlights em cascata ao apagar o livro', async () => {
    const [u] = await ctx.sql`
      insert into app_users (email) values ('c@b.com') returning id`;
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${u.id}, 'L', 'L') returning id`;
    await ctx.sql`insert into highlights (user_id, book_id, kind)
                  values (${u.id}, ${b.id}, 'bookmark')`;
    await ctx.sql`delete from books where id = ${b.id}`;
    // Escopado por book_id: a suíte reusa o mesmo schema entre os `it`s
    // (um único createTestDb por describe), então outros testes já
    // deixaram highlights de outros livros na tabela.
    const rows = await ctx.sql`select id from highlights where book_id = ${b.id}`;
    expect(rows).toHaveLength(0);
  });

  it('rejeita duas linhas de reading_progress para o mesmo user_id+book_id', async () => {
    const [u] = await ctx.sql`
      insert into app_users (email) values ('rp1@b.com') returning id`;
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${u.id}, 'L', 'L') returning id`;

    await ctx.sql`
      insert into reading_progress (user_id, book_id) values (${u.id}, ${b.id})`;

    await expect(
      ctx.sql`
        insert into reading_progress (user_id, book_id) values (${u.id}, ${b.id})`
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('onConflictDoUpdate sobre (user_id, book_id) resulta em uma única linha', async () => {
    const [u] = await ctx.sql`
      insert into app_users (email) values ('rp2@b.com') returning id`;
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${u.id}, 'L', 'L') returning id`;

    const upsert = () =>
      ctx.db
        .insert(readingProgress)
        .values({ userId: u.id, bookId: b.id, secondsRead: 10 })
        .onConflictDoUpdate({
          target: [readingProgress.userId, readingProgress.bookId],
          set: {
            secondsRead: drizzleSql`${readingProgress.secondsRead} + 10`,
            updatedAt: drizzleSql`now()`,
          },
        });

    await upsert();
    await upsert();

    const rows = await ctx.sql`
      select seconds_read from reading_progress
      where user_id = ${u.id} and book_id = ${b.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].seconds_read).toBe(20);
  });
});
