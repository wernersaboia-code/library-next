import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const [u] = await ctx.sql`insert into app_users (email) values ('col@x.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

async function novaColecao(nome: string): Promise<number> {
  const [c] = await ctx.sql`
    insert into collections (user_id, name) values (${userId}, ${nome}) returning id`;
  return c.id;
}

async function novoLivro(titulo: string): Promise<number> {
  const [b] = await ctx.sql`
    insert into books (user_id, title, title_source)
    values (${userId}, ${titulo}, ${titulo}) returning id`;
  return b.id;
}

describe('schema de bibliotecas', () => {
  it('cria uma biblioteca com nome e dono', async () => {
    const id = await novaColecao('Terror');
    const [c] = await ctx.sql`select name, user_id from collections where id = ${id}`;
    expect(c.name).toBe('Terror');
    expect(c.user_id).toBe(userId);
  });

  it('recusa nome repetido ignorando maiúsculas (AD-8)', async () => {
    await novaColecao('Ficção Científica');
    await expect(
      novaColecao('ficção científica')
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('vincula livro a biblioteca', async () => {
    const c = await novaColecao('Vínculo');
    const b = await novoLivro('Livro A');
    await ctx.sql`
      insert into book_collections (book_id, collection_id) values (${b}, ${c})`;
    const rows = await ctx.sql`
      select book_id from book_collections where collection_id = ${c}`;
    expect(rows).toHaveLength(1);
  });

  it('recusa vincular o mesmo livro duas vezes', async () => {
    const c = await novaColecao('Duplo');
    const b = await novoLivro('Livro B');
    await ctx.sql`insert into book_collections (book_id, collection_id) values (${b}, ${c})`;
    await expect(ctx.sql`
      insert into book_collections (book_id, collection_id) values (${b}, ${c})`
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('apagar a biblioteca remove os vínculos e PRESERVA os livros', async () => {
    const c = await novaColecao('Some');
    const b = await novoLivro('Sobrevivente');
    await ctx.sql`insert into book_collections (book_id, collection_id) values (${b}, ${c})`;

    await ctx.sql`delete from collections where id = ${c}`;

    const vinculos = await ctx.sql`
      select book_id from book_collections where collection_id = ${c}`;
    expect(vinculos).toHaveLength(0);
    const livro = await ctx.sql`select id from books where id = ${b}`;
    expect(livro).toHaveLength(1);
  });

  it('apagar o livro remove os vínculos dele', async () => {
    const c = await novaColecao('Perde Livro');
    const b = await novoLivro('Efêmero');
    await ctx.sql`insert into book_collections (book_id, collection_id) values (${b}, ${c})`;

    await ctx.sql`delete from books where id = ${b}`;

    const vinculos = await ctx.sql`
      select book_id from book_collections where book_id = ${b}`;
    expect(vinculos).toHaveLength(0);
  });

  it('as duas tabelas têm RLS habilitada e forçada', async () => {
    const rows = await ctx.sql`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relname in ('collections', 'book_collections')
        and relnamespace = current_schema()::regnamespace`;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.relrowsecurity).toBe(true);
      expect(r.relforcerowsecurity).toBe(true);
    }
  });

  it('a policy do vínculo exige dono da biblioteca E do livro (AD-7)', async () => {
    const [p] = await ctx.sql`
      select qual::text as expressao from pg_policies
      where tablename = 'book_collections' and schemaname = current_schema()`;
    expect(p).toBeDefined();
    if (!p) return;
    expect(String(p.expressao)).toMatch(/collections/);
    expect(String(p.expressao)).toMatch(/books/);
  });
});
