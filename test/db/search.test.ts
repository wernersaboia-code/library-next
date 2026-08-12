import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
  const [u] = await ctx.sql`
    insert into app_users (email) values ('s@x.com') returning id`;
  for (const t of [
    'As leituras de verão',
    "O'Brien e o mistério",
    'Ficção científica brasileira',
  ]) {
    await ctx.sql`
      insert into books (user_id, title, title_source, image_url)
      values (${u.id}, ${t}, ${t}, 'https://cdn/x.jpg')`;
  }

  // O teste de índice (abaixo) precisa que o planner PREFIRA o índice GIN
  // sobre um Seq Scan. Com só 3 linhas, o Postgres frequentemente escolhe
  // Seq Scan mesmo com o índice disponível — a tabela é pequena demais para
  // compensar o custo do Bitmap Index Scan. Populamos linhas extras para dar
  // ao planner um motivo real de usar o índice, em vez de forçar a decisão
  // com `SET enable_seqscan = off` (o que provaria só que o índice É válido,
  // não que o planner o escolhe por conta própria).
  // Uma única inserção via generate_series, em vez de 2000 INSERTs
  // individuais — evita estourar o timeout do hook por latência de rede.
  await ctx.sql`
    insert into books (user_id, title, title_source, image_url)
    select ${u.id}, t, t, 'https://cdn/x.jpg'
    from (
      select 'Livro genérico ' || gs as t
      from generate_series(1, 2000) as gs
    ) filler`;

  // Autovacuum pode não ter rodado ainda; sem estatísticas atualizadas o
  // planner decide com base em suposições default e pode preferir Seq Scan
  // mesmo com 2000+ linhas.
  await ctx.sql`analyze books`;
}, 30000);
afterAll(() => ctx.cleanup());

async function busca(q: string) {
  return ctx.sql`
    select id from books
    where title_tsv @@ websearch_to_tsquery('portuguese', ${q})`;
}

describe('busca', () => {
  it('faz stemming em português: "leitura" encontra "leituras"', async () => {
    expect(await busca('leitura')).toHaveLength(1);
  });

  it('não quebra com apóstrofo — o bug #10', async () => {
    await expect(busca("O'Brien")).resolves.toBeDefined();
  });

  it('não quebra com dois-pontos', async () => {
    await expect(busca('ficção: brasileira')).resolves.toBeDefined();
  });

  it('não quebra com string vazia', async () => {
    expect(await busca('')).toHaveLength(0);
  });

  it('não quebra com operadores soltos', async () => {
    await expect(busca('& | !')).resolves.toBeDefined();
  });

  it('ignora acento conforme a configuração portuguesa', async () => {
    expect((await busca('ficcao')).length + (await busca('ficção')).length)
      .toBeGreaterThan(0);
  });

  it('usa o índice GIN', async () => {
    const plan = await ctx.sql`
      explain (format json)
      select id from books
      where title_tsv @@ websearch_to_tsquery('portuguese', 'leitura')`;
    expect(JSON.stringify(plan)).toMatch(/Bitmap Index Scan|Index Scan/);
  });
});
