import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

const ANO = new Date().getFullYear();

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  const [u] = await ctx.sql`insert into app_users (email) values ('sp@x.com') returning id`;
  userId = u.id;
  vi.doMock('@/lib/auth-user', () => ({
    getCurrentUserId: async () => userId,
    AuthError: class extends Error {},
  }));

  const hoje = new Date().toISOString().slice(0, 10);

  // concluído hoje: conta no mês e no ano
  await ctx.sql`
    insert into books (user_id, title, title_source, read_status, num_pages, date_finished)
    values (${userId}, 'Do Mês', 'Do Mês', 'lido', 300, ${hoje})`;
  // concluído em 31/12 do ano anterior: não conta em nenhum dos dois
  await ctx.sql`
    insert into books (user_id, title, title_source, read_status, num_pages, date_finished)
    values (${userId}, 'Réveillon', 'Réveillon', 'lido', 200, ${`${ANO - 1}-12-31`})`;
  // lido sem data: conta em lidos, não no período
  await ctx.sql`
    insert into books (user_id, title, title_source, read_status, num_pages)
    values (${userId}, 'Sem Data', 'Sem Data', 'lido', 500)`;
  // abandonado: não conta em lidos nem em páginas
  await ctx.sql`
    insert into books (user_id, title, title_source, read_status, num_pages, progress_percent)
    values (${userId}, 'Largado', 'Largado', 'abandonado', 400, 30)`;
});
afterAll(() => ctx.cleanup());

async function stats() {
  const mod = await import('@/app/api/reading/stats/route');
  const res = await mod.GET();
  return res.json();
}

describe('estatísticas por período', () => {
  it('conta livros e páginas concluídos no ano corrente', async () => {
    const d = await stats();
    expect(d.ano.livros).toBe(1);
    expect(d.ano.paginas).toBe(300);
  });

  it('livro terminado em 31 de dezembro não vaza para o ano seguinte', async () => {
    const d = await stats();
    expect(d.ano.livros).toBe(1);   // 'Réveillon' ficou de fora
  });

  it('conta livros e páginas do mês corrente', async () => {
    const d = await stats();
    expect(d.mes.livros).toBe(1);
    expect(d.mes.paginas).toBe(300);
  });

  it('informa quantos lidos estão sem data (AD-2)', async () => {
    const d = await stats();
    expect(d.lidosSemData).toBe(1);
  });

  it('abandonados têm contagem própria', async () => {
    const d = await stats();
    expect(d.abandonados).toBe(1);
  });

  it('abandonado não entra em lidos nem nas páginas lidas (AD-8)', async () => {
    const d = await stats();
    expect(d.lidos).toBe(3);           // Do Mês, Réveillon, Sem Data
    expect(d.paginasLidas).toBe(1000); // 300 + 200 + 500, sem os 400 do largado
  });
});
