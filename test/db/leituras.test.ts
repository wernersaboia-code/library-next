import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();

  const [u] = await ctx.sql`
    insert into app_users (email) values ('l@x.com') returning id`;
  userId = u.id;

  async function livro(
    dono: string,
    title: string,
    read_status: string,
    date_finished: string | null
  ) {
    await ctx.sql`
      insert into books (user_id, title, title_source, read_status,
                         date_finished, owned)
      values (${dono}, ${title}, ${title}, ${read_status},
              ${date_finished}, true)`;
  }

  // Lidos COM data: a ordem cronológica inversa é 2026 > 2025 > 2024.
  await livro(userId, 'Lido recente', 'lido', '2026-05-10');
  await livro(userId, 'Lido antigo', 'lido', '2024-01-02');
  await livro(userId, 'Lido do meio', 'lido', '2025-03-01');
  // Mesma data: desempata por título, então 'A' vem antes de 'B'.
  await livro(userId, 'B na mesma data', 'lido', '2025-06-01');
  await livro(userId, 'A na mesma data', 'lido', '2025-06-01');
  // Lidos SEM data: o acervo real tem 17 assim; devem ficar no fim,
  // em ordem alfabética, não no topo (que é onde DESC os põe por padrão).
  await livro(userId, 'Zebra sem data', 'lido', null);
  await livro(userId, 'Abacate sem data', 'lido', null);
  // Outros status não podem vazar para nenhuma das listas.
  await livro(userId, 'Nunca abri', 'não lido', null);
  await livro(userId, 'Estou lendo', 'lendo', null);
  // Abandonados, inseridos fora de ordem para provar a ordenação.
  await livro(userId, 'Zumbi entediante', 'abandonado', null);
  await livro(userId, 'Arrastado demais', 'abandonado', null);

  // Isolamento entre usuários NÃO é testado aqui de propósito: o banco de
  // teste conecta como o papel `postgres` (BYPASSRLS=true), então a RLS que
  // `withUser` depende nunca filtra nada sob este mock — um segundo usuário
  // apareceria nas duas listas mesmo com o código de produção correto, o que
  // proibiria exatamente o comportamento certo. `test/db/rls.test.ts` já
  // prova esse mecanismo (via `SET LOCAL ROLE`, papel sem BYPASSRLS) para
  // toda query que passa por `withUser` — inclusive estas duas, que seguem
  // exatamente o padrão de `fetchFavorites`/`fetchNextUp`, já cobertas por
  // aquela prova. Mesmo precedente de `test/db/proximos-favoritos-queries.test.ts`
  // e `test/db/ownership-filter.test.ts`, nenhuma das quais insere um
  // segundo usuário sob este mock.

  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  vi.doMock('@/lib/auth-user', () => ({
    getCurrentUserId: async () => userId,
    AuthError: class extends Error {},
  }));
}, 30000);
afterAll(() => ctx.cleanup());

describe('fetchLidos', () => {
  it('ordena por data desc, desempata por título e põe sem-data no fim', async () => {
    const { fetchLidos } = await import('@/lib/db/queries');
    const titulos = (await fetchLidos(userId)).map((l) => l.title);
    expect(titulos).toEqual([
      'Lido recente',
      'A na mesma data',
      'B na mesma data',
      'Lido do meio',
      'Lido antigo',
      'Abacate sem data',
      'Zebra sem data',
    ]);
  });
});

describe('fetchAbandonados', () => {
  it('traz só os abandonados, em ordem alfabética', async () => {
    const { fetchAbandonados } = await import('@/lib/db/queries');
    const titulos = (await fetchAbandonados(userId)).map((l) => l.title);
    expect(titulos).toEqual(['Arrastado demais', 'Zumbi entediante']);
  });
});
