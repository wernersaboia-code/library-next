import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { createTestDb } from '../helpers/db';

// Como esta suíte PROVA o isolamento (e por que não é um falso positivo):
//
// O banco de teste é um Supabase gerenciado; a conexão do runner é o papel
// `postgres`, que tem rolbypassrls=true. Um papel com BYPASSRLS ignora RLS
// por completo — então rodar as queries como `postgres` passaria vazio e não
// provaria nada. Por isso cada query "de aplicação" roda sob `SET LOCAL ROLE`
// para um papel escopado à suíte (`role_test_*`), criado SEM LOGIN e SEM
// BYPASSRLS. Esse papel respeita as policies; é o análogo de teste do papel
// `book_app` de produção. O owner só é usado para semear os dados (aí o
// BYPASSRLS é conveniente) e para administrar o papel.
//
// `app.user_id` é definido com escopo local dentro da mesma transação, igual
// ao que o `withUser` faz em produção. Sem ele, `app_current_user_id()`
// retorna NULL e nada casa (falha fechado).

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let roleName: string;
let userA: string;
let userB: string;
let bookAId: number;

// Roda `fn` como o papel não-privilegiado, com `app.user_id = uid` definido
// localmente na transação. `SET LOCAL ROLE` e `set_config(..., true)` revertem
// no fim da transação.
async function asUser<T>(
  uid: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  // postgres.js `begin` retorna Promise<UnwrapPromiseArray<T>>; para o nosso
  // uso (T é uma lista de linhas, nunca um array de Promises) isso é T, mas o
  // TS não consegue provar isso genericamente — daí o cast.
  const result = await ctx.sql.begin(async (tx) => {
    await tx.unsafe(`set local role "${roleName}"`);
    await tx`select set_config('app.user_id', ${uid}, true)`;
    return fn(tx);
  });
  return result as T;
}

beforeAll(async () => {
  ctx = await createTestDb();
  roleName = `role_${ctx.name}`;

  // Papel escopado à suíte: sem LOGIN, sem BYPASSRLS => respeita RLS.
  // Grants apenas no schema da suíte, para não tocar em nada global.
  await ctx.sql.unsafe(`
    create role "${roleName}" nologin;
    grant "${roleName}" to current_user;
    grant usage on schema "${ctx.name}" to "${roleName}";
    grant select, insert, update, delete
      on all tables in schema "${ctx.name}" to "${roleName}";
    grant usage, select
      on all sequences in schema "${ctx.name}" to "${roleName}";
  `);

  // Semeia como owner (BYPASSRLS): dados de A.
  const [a] = await ctx.sql`
    insert into app_users (email) values ('a@x.com') returning id`;
  const [b] = await ctx.sql`
    insert into app_users (email) values ('b@x.com') returning id`;
  userA = a.id;
  userB = b.id;

  const [bookA] = await ctx.sql`
    insert into books (user_id, title, title_source)
    values (${userA}, 'Livro de A', 'Livro de A') returning id`;
  bookAId = bookA.id;

  await ctx.sql`
    insert into highlights (user_id, book_id, kind, text_content)
    values (${userA}, ${bookAId}, 'quote', 'segredo de A')`;

  await ctx.sql`
    insert into authors (id, name) values ('author-1', 'Autor Um')`;
  await ctx.sql`
    insert into book_to_author (book_id, author_id)
    values (${bookAId}, 'author-1')`;
});

afterAll(async () => {
  if (!ctx) return;
  // Remove privilégios do papel escopado antes de derrubar o schema, e então
  // dropa o papel — senão vaza um papel global no cluster do usuário.
  if (roleName) {
    await ctx.sql.unsafe(`drop owned by "${roleName}"`).catch(() => {});
  }
  await ctx.cleanup();
  if (roleName) {
    const admin = postgres(ctx.url, { max: 1, prepare: false });
    await admin.unsafe(`drop role if exists "${roleName}"`);
    await admin.end();
  }
});

describe('RLS', () => {
  it('o dono enxerga os próprios destaques', async () => {
    const rows = await asUser(userA, (tx) => tx`select id from highlights`);
    expect(rows).toHaveLength(1);
  });

  it('o usuário B NÃO enxerga os destaques de A', async () => {
    const rows = await asUser(userB, (tx) => tx`select id from highlights`);
    expect(rows).toHaveLength(0);
  });

  it('o usuário B NÃO enxerga os livros de A', async () => {
    const rows = await asUser(userB, (tx) => tx`select id from books`);
    expect(rows).toHaveLength(0);
  });

  it('o usuário B não consegue apagar os destaques de A', async () => {
    await asUser(userB, (tx) => tx`delete from highlights`);
    const rows = await asUser(userA, (tx) => tx`select id from highlights`);
    expect(rows).toHaveLength(1);
  });

  it('não é possível inserir em nome de outro usuário (WITH CHECK)', async () => {
    await expect(
      asUser(userB, (tx) =>
        tx`insert into highlights (user_id, book_id, kind)
           values (${userA}, ${bookAId}, 'note')`)
    ).rejects.toThrow(/row-level security/);
  });

  it('sem app.user_id definido, nada é visível (falha fechado)', async () => {
    // Mesmo papel não-privilegiado, mas sem definir app.user_id:
    // app_current_user_id() é NULL => nenhuma linha casa.
    const rows = await ctx.sql.begin(async (tx) => {
      await tx.unsafe(`set local role "${roleName}"`);
      return tx`select id from highlights`;
    });
    expect(rows).toHaveLength(0);
  });

  it('book_to_author respeita a posse herdada de books', async () => {
    const seen = await asUser(userA, (tx) => tx`select book_id from book_to_author`);
    expect(seen).toHaveLength(1);

    const hidden = await asUser(userB, (tx) => tx`select book_id from book_to_author`);
    expect(hidden).toHaveLength(0);
  });
});
