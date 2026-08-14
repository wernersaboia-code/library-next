import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const [u] = await ctx.sql`insert into app_users (email) values ('rp@x.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

async function inserir(campos: Record<string, unknown> = {}) {
  const status = (campos.read_status ?? 'não lido') as string;
  const progresso = (campos.progress_percent ?? null) as number | null;
  return ctx.sql`
    insert into books (user_id, title, title_source, read_status, progress_percent)
    values (${userId}, 'L', 'L', ${status}, ${progresso})
    returning id, progress_percent, progress_updated_at, dnf_reason`;
}

describe('colunas de progresso', () => {
  it('nascem nulas e não alteram livros existentes', async () => {
    const [b] = await inserir();
    expect(b.progress_percent).toBeNull();
    expect(b.progress_updated_at).toBeNull();
    expect(b.dnf_reason).toBeNull();
  });

  it('aceita 0 e 100', async () => {
    const [zero] = await inserir({ progress_percent: 0 });
    expect(zero.progress_percent).toBe(0);
    const [cem] = await inserir({ progress_percent: 100 });
    expect(cem.progress_percent).toBe(100);
  });

  it('recusa progresso negativo', async () => {
    await expect(inserir({ progress_percent: -1 })).rejects.toThrow(/check/i);
  });

  it('recusa progresso acima de 100', async () => {
    await expect(inserir({ progress_percent: 101 })).rejects.toThrow(/check/i);
  });

  it('guarda o motivo do abandono', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, read_status, dnf_reason)
      values (${userId}, 'A', 'A', 'abandonado', 'ritmo arrastado')
      returning dnf_reason`;
    expect(b.dnf_reason).toBe('ritmo arrastado');
  });
});

describe('trava de read_status (AD-9)', () => {
  it('aceita os quatro valores válidos', async () => {
    for (const status of ['lido', 'lendo', 'não lido', 'abandonado']) {
      const [b] = await inserir({ read_status: status });
      expect(b).toBeDefined();
    }
  });

  it('recusa um status inventado', async () => {
    await expect(inserir({ read_status: 'quase lido' })).rejects.toThrow(/check/i);
  });
});
