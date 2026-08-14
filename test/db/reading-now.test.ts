import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

// Arquivo próprio de propósito: `fetchReadingNow` depende da RLS para
// escopar por dono, e nos testes a RLS fica inerte (o papel do banco a
// ignora — a mesma pendência que vale em produção enquanto a aplicação
// conectar como `postgres`). Compartilhar o schema com outros casos que
// inserem livros "lendo" faria a consulta enxergá-los.
let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  const [u] = await ctx.sql`insert into app_users (email) values ('rn@x.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

describe('fetchReadingNow', () => {
  it('devolve só os com status lendo, do mais recente para o mais antigo', async () => {
    await ctx.sql`
      insert into books (user_id, title, title_source, read_status,
                         progress_percent, progress_updated_at)
      values (${userId}, 'Antigo', 'Antigo', 'lendo', 20, '2026-07-01T10:00:00Z')`;
    await ctx.sql`
      insert into books (user_id, title, title_source, read_status,
                         progress_percent, progress_updated_at)
      values (${userId}, 'Recente', 'Recente', 'lendo', 60, '2026-08-10T10:00:00Z')`;
    await ctx.sql`
      insert into books (user_id, title, title_source, read_status)
      values (${userId}, 'Não comecei', 'Não comecei', 'não lido')`;
    await ctx.sql`
      insert into books (user_id, title, title_source, read_status, progress_percent)
      values (${userId}, 'Largado', 'Largado', 'abandonado', 30)`;

    const { fetchReadingNow } = await import('@/lib/db/queries');
    const livros = await fetchReadingNow(userId);

    expect(livros.map((l) => l.title)).toEqual(['Recente', 'Antigo']);
  });

  it('livro em leitura sem data de atualização vai para o fim, não para o topo', async () => {
    await ctx.sql`
      insert into books (user_id, title, title_source, read_status)
      values (${userId}, 'Sem Carimbo', 'Sem Carimbo', 'lendo')`;

    const { fetchReadingNow } = await import('@/lib/db/queries');
    const livros = await fetchReadingNow(userId);

    expect(livros[livros.length - 1].title).toBe('Sem Carimbo');
  });

  it('limita a 6 livros (AD-5)', async () => {
    for (let i = 0; i < 9; i++) {
      await ctx.sql`
        insert into books (user_id, title, title_source, read_status,
                           progress_percent, progress_updated_at)
        values (${userId}, ${'L' + i}, ${'L' + i}, 'lendo', ${i * 10}, now())`;
    }
    const { fetchReadingNow } = await import('@/lib/db/queries');
    expect(await fetchReadingNow(userId)).toHaveLength(6);
  });
});
