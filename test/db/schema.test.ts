import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

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
      values (${u.id}, ${b.id}, 'quote', 'as leituras de verão', 'meu comentário')`;

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
                  values (${u.id}, ${b.id}, 'note')`;
    await ctx.sql`delete from books where id = ${b.id}`;
    // Escopado por book_id: a suíte reusa o mesmo schema entre os `it`s
    // (um único createTestDb por describe), então outros testes já
    // deixaram highlights de outros livros na tabela.
    const rows = await ctx.sql`select id from highlights where book_id = ${b.id}`;
    expect(rows).toHaveLength(0);
  });
});
