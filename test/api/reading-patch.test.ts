import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
let ultimoSet: Record<string, unknown> = {};

// Estado que o banco devolveria para o livro alvo. Cada teste ajusta antes
// de chamar a rota — é o que torna possível afirmar sobre regras que
// dependem do status atual em vez do que o cliente mandou.
let livroAtual: Record<string, unknown> | undefined;

vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));

// O handler monta um objeto `set` e o entrega ao update. Capturamos esse
// objeto (ver beforeEach) para afirmar sobre o que seria gravado.
async function PATCH(id: string, body: unknown) {
  const mod = await import('@/app/api/books/[id]/route');
  return mod.PATCH(
    new Request(`http://x/api/books/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ultimoSet = {};
  livroAtual = { read_status: 'não lido', owned: true, next_up: false, favorite: false };
  run.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => (livroAtual ? [livroAtual] : []),
          }),
        }),
      }),
      update: () => ({
        set: (valores: Record<string, unknown>) => {
          ultimoSet = valores;
          return { where: () => ({ returning: async () => [{ id: 1 }] }) };
        },
      }),
    };
    return fn(tx);
  });
});

describe('progresso', () => {
  it('salvar 45% marca o livro como lendo e carimba a data (AD-6)', async () => {
    const res = await PATCH('1', { progressPercent: 45 });
    expect(res.status).toBe(200);
    expect(ultimoSet.progress_percent).toBe(45);
    expect(ultimoSet.read_status).toBe('lendo');
    expect(ultimoSet.progress_updated_at).toBeInstanceOf(Date);
  });

  it('salvar 0% não muda o status — não é leitura começada', async () => {
    await PATCH('1', { progressPercent: 0 });
    expect(ultimoSet.progress_percent).toBe(0);
    expect(ultimoSet.read_status).toBeUndefined();
  });

  it('salvar 100% não marca lido sozinho (AD-6)', async () => {
    await PATCH('1', { progressPercent: 100 });
    expect(ultimoSet.read_status).toBeUndefined();
    expect(ultimoSet.date_finished).toBeUndefined();
  });

  it('recusa progresso acima de 100', async () => {
    expect((await PATCH('1', { progressPercent: 101 })).status).toBe(400);
  });

  it('recusa progresso negativo', async () => {
    expect((await PATCH('1', { progressPercent: -1 })).status).toBe(400);
  });

  it('recusa progresso fracionário', async () => {
    expect((await PATCH('1', { progressPercent: 45.5 })).status).toBe(400);
  });
});

describe('terminei hoje', () => {
  it('grava status, 100% e data de conclusão juntos (AD-1)', async () => {
    const res = await PATCH('1', { finishedToday: true });
    expect(res.status).toBe(200);
    expect(ultimoSet.read_status).toBe('lido');
    expect(ultimoSet.progress_percent).toBe(100);
    expect(typeof ultimoSet.date_finished).toBe('string');
  });
});

describe('status pelo seletor', () => {
  it('não grava data nenhuma (AD-1)', async () => {
    await PATCH('1', { readStatus: 'lido' });
    expect(ultimoSet.read_status).toBe('lido');
    expect(ultimoSet.date_finished).toBeUndefined();
    expect(ultimoSet.progress_updated_at).toBeUndefined();
  });

  it('não apaga o progresso já gravado', async () => {
    await PATCH('1', { readStatus: 'lido' });
    expect(ultimoSet.progress_percent).toBeUndefined();
  });

  it('aceita abandonado como status válido (AD-7)', async () => {
    const res = await PATCH('1', { readStatus: 'abandonado' });
    expect(res.status).toBe(200);
    expect(ultimoSet.read_status).toBe('abandonado');
  });

  it('recusa status inventado', async () => {
    expect((await PATCH('1', { readStatus: 'quase lido' })).status).toBe(400);
  });
});

describe('motivo do abandono', () => {
  it('grava o motivo', async () => {
    await PATCH('1', { readStatus: 'abandonado', dnfReason: 'ritmo arrastado' });
    expect(ultimoSet.dnf_reason).toBe('ritmo arrastado');
  });

  it('aceita limpar o motivo', async () => {
    await PATCH('1', { dnfReason: null });
    expect(ultimoSet.dnf_reason).toBeNull();
  });
});

describe('progresso não sobrescreve decisão do dono (AD-3)', () => {
  it('livro abandonado continua abandonado ao receber progresso', async () => {
    livroAtual = { read_status: 'abandonado', owned: true, next_up: false, favorite: false };
    const res = await PATCH('1', { progressPercent: 50 });
    expect(res.status).toBe(200);
    expect(ultimoSet.progress_percent).toBe(50);
    expect(ultimoSet.read_status).toBeUndefined();
  });

  it('livro lido continua lido ao receber progresso', async () => {
    livroAtual = { read_status: 'lido', owned: true, next_up: false, favorite: false };
    await PATCH('1', { progressPercent: 50 });
    expect(ultimoSet.read_status).toBeUndefined();
  });

  it('livro não lido vira lendo ao receber progresso', async () => {
    livroAtual = { read_status: 'não lido', owned: true, next_up: false, favorite: false };
    await PATCH('1', { progressPercent: 50 });
    expect(ultimoSet.read_status).toBe('lendo');
  });

  it('abandonar e gravar progresso no mesmo pedido mantém abandonado', async () => {
    livroAtual = { read_status: 'lendo', owned: true, next_up: false, favorite: false };
    await PATCH('1', { readStatus: 'abandonado', progressPercent: 50 });
    expect(ultimoSet.read_status).toBe('abandonado');
    expect(ultimoSet.progress_percent).toBe(50);
  });

  it('devolve 404 quando o livro não existe', async () => {
    livroAtual = undefined;
    const res = await PATCH('1', { progressPercent: 50 });
    expect(res.status).toBe(404);
  });
});
