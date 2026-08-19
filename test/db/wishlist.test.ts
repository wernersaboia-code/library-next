import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();

  const [u] = await ctx.sql`insert into app_users (email) values ('w@x.com') returning id`;
  userId = u.id;

  // desejado: manual, não possuído — deve aparecer
  const [livroComAutor] = await ctx.sql`
    insert into books (user_id, title, title_source, source, owned)
    values (${userId}, 'Quero Ter', 'Quero Ter', 'manual', false) returning id`;
  const [autor] = await ctx.sql`
    insert into authors (id, name) values ('autora-exemplo', 'Autora Exemplo') returning id`;
  await ctx.sql`
    insert into book_to_author (book_id, author_id)
    values (${livroComAutor.id}, ${autor.id})`;
  // desejado sem autor cadastrado — não pode quebrar a agregação
  await ctx.sql`
    insert into books (user_id, title, title_source, source, owned)
    values (${userId}, 'Sem Autor', 'Sem Autor', 'manual', false)`;
  // manual mas já possuído — não é desejo, não deve aparecer
  await ctx.sql`
    insert into books (user_id, title, title_source, source, owned)
    values (${userId}, 'Manual Possuido', 'Manual Possuido', 'manual', true)`;
  // do calibre, possuído — não deve aparecer
  await ctx.sql`
    insert into books (user_id, title, title_source, source, owned)
    values (${userId}, 'Do Calibre Possuido', 'Do Calibre Possuido', 'calibre', true)`;
  // do calibre, mas apagado de lá (owned=false) — deliberadamente NÃO entra
  // na lista de desejados; é "tive e não tenho mais", não "quero ter"
  await ctx.sql`
    insert into books (user_id, title, title_source, source, owned)
    values (${userId}, 'Sumiu do Calibre', 'Sumiu do Calibre', 'calibre', false)`;

  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  vi.doMock('@/lib/auth-user', () => ({
    getCurrentUserId: async () => userId,
    AuthError: class extends Error {},
  }));
});
afterAll(() => ctx.cleanup());

describe('fetchWishlist', () => {
  it('lista só livros manuais e não possuídos', async () => {
    const { fetchWishlist } = await import('@/lib/db/queries');
    const rows = await fetchWishlist(userId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.title).sort()).toEqual(['Quero Ter', 'Sem Autor'].sort());
  });

  it('traz o nome do autor quando o livro tem autor cadastrado', async () => {
    const { fetchWishlist } = await import('@/lib/db/queries');
    const rows = await fetchWishlist(userId);
    const livro = rows.find((r) => r.title === 'Quero Ter');
    expect(livro?.authors).toEqual(['Autora Exemplo']);
  });

  it('não quebra quando o livro não tem autor cadastrado', async () => {
    const { fetchWishlist } = await import('@/lib/db/queries');
    const rows = await fetchWishlist(userId);
    const livro = rows.find((r) => r.title === 'Sem Autor');
    expect(livro?.authors).toEqual([]);
  });

  it('ignora livros do Calibre mesmo quando owned=false', async () => {
    const { fetchWishlist } = await import('@/lib/db/queries');
    const rows = await fetchWishlist(userId);
    expect(rows.some((r) => r.title === 'Sumiu do Calibre')).toBe(false);
  });

  it('ignora manuais já possuídos', async () => {
    const { fetchWishlist } = await import('@/lib/db/queries');
    const rows = await fetchWishlist(userId);
    expect(rows.some((r) => r.title === 'Manual Possuido')).toBe(false);
  });

  it('devolve capa e nota dos leitores', async () => {
    const [u] = await ctx.sql`insert into app_users (email) values ('wn@x.com') returning id`;
    await ctx.sql`
      insert into books (user_id, title, title_source, source, owned,
                         image_url, average_rating, ratings_count)
      values (${u.id}, 'Com Nota', 'Com Nota', 'manual', false,
              'https://cdn/c.jpg', 4.32, 1847)`;
    const { fetchWishlist } = await import('@/lib/db/queries');
    const rows = await fetchWishlist(u.id);
    const livro = rows.find((r) => r.title === 'Com Nota');
    expect(livro?.image_url).toBe('https://cdn/c.jpg');
    expect(Number(livro?.average_rating)).toBeCloseTo(4.32);
    expect(livro?.ratings_count).toBe(1847);
  });
});

describe('ordem da lista de desejados', () => {
  it('ordena por título, não por data de cadastro', async () => {
    const [u] = await ctx.sql`
      insert into app_users (email) values ('ordem@x.com') returning id`;
    // Inseridos fora de ordem alfabética de propósito: com o ORDER BY antigo
    // (created_at) sairiam nesta mesma ordem, e o teste passaria por engano.
    const titulosInseridos = ['Zumbi', 'Alien', 'Ártico', '100 anos', 'Echo'];
    for (const t of titulosInseridos) {
      await ctx.sql`
        insert into books (user_id, title, title_source, source, owned)
        values (${u.id}, ${t}, ${t}, 'manual', false)`;
    }

    const { fetchWishlist } = await import('@/lib/db/queries');
    const todos = (await fetchWishlist(u.id)).map((r) => r.title);

    // Filtra para só os títulos que ESTA inserção acabou de criar, em vez de
    // comparar o array inteiro: `fetchWishlist` não filtra por usuário no
    // banco de teste (a suíte conecta como `postgres`, que ignora RLS — o
    // mesmo mecanismo que test/db/rls.test.ts existe para provar de verdade,
    // via SET LOCAL ROLE). `todos` inclui então os livros de OUTROS testes
    // deste arquivo, que rodam antes deste no mesmo schema. Como o filtro
    // preserva a ordem relativa do array original, e a ordenação continua
    // sendo feita só pelo `ORDER BY title` do Postgres, isolar por conteúdo
    // prova a ordenação sem depender de isolamento por usuário.
    const titulos = todos.filter((t) => titulosInseridos.includes(t));

    // Acento não desloca o item para o fim: a collation do banco põe "Á"
    // logo depois de "A". Números vêm antes das letras — é onde o Postgres
    // os põe, e o agrupamento do cliente segue essa ordem em vez de brigar
    // com ela.
    expect(titulos).toEqual(['100 anos', 'Alien', 'Ártico', 'Echo', 'Zumbi']);
  });
});
