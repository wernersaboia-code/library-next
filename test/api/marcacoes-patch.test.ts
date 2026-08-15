import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
let ultimoSet: Record<string, unknown> = {};

// Estado que o banco devolveria para o livro alvo. Cada teste ajusta antes
// de chamar a rota — as regras de fila e favorito dependem do que está
// gravado, não do que o cliente mandou.
let livroAtual: Record<string, unknown> | undefined;

vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));

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

describe('nota com meia estrela (AD-1)', () => {
  it('aceita 3,5', async () => {
    const res = await PATCH('1', { myRating: 3.5 });
    expect(res.status).toBe(200);
    expect(ultimoSet.my_rating).toBe(3.5);
  });

  it('aceita 0,5 e 5', async () => {
    await PATCH('1', { myRating: 0.5 });
    expect(ultimoSet.my_rating).toBe(0.5);
    await PATCH('1', { myRating: 5 });
    expect(ultimoSet.my_rating).toBe(5);
  });

  it('aceita limpar a nota', async () => {
    await PATCH('1', { myRating: null });
    expect(ultimoSet.my_rating).toBeNull();
  });

  it('recusa um quarto de estrela', async () => {
    expect((await PATCH('1', { myRating: 3.25 })).status).toBe(400);
  });

  it('recusa zero e recusa acima de cinco', async () => {
    expect((await PATCH('1', { myRating: 0 })).status).toBe(400);
    expect((await PATCH('1', { myRating: 5.5 })).status).toBe(400);
  });
});

describe('fila de próximos (AD-6)', () => {
  it('marca livro que o dono tem', async () => {
    livroAtual = { read_status: 'não lido', owned: true, next_up: false, favorite: false };
    const res = await PATCH('1', { nextUp: true });
    expect(res.status).toBe(200);
    expect(ultimoSet.next_up).toBe(true);
  });

  it('recusa livro que o dono não tem', async () => {
    livroAtual = { read_status: 'não lido', owned: false, next_up: false, favorite: false };
    const res = await PATCH('1', { nextUp: true });
    expect(res.status).toBe(409);
  });

  it('desmarcar não exige posse', async () => {
    livroAtual = { read_status: 'não lido', owned: false, next_up: true, favorite: false };
    const res = await PATCH('1', { nextUp: false });
    expect(res.status).toBe(200);
    expect(ultimoSet.next_up).toBe(false);
  });

  it('sai da fila sozinho ao virar lido', async () => {
    livroAtual = { read_status: 'lendo', owned: true, next_up: true, favorite: false };
    await PATCH('1', { readStatus: 'lido' });
    expect(ultimoSet.next_up).toBe(false);
  });

  it('sai da fila com o botão Terminei hoje', async () => {
    livroAtual = { read_status: 'lendo', owned: true, next_up: true, favorite: false };
    await PATCH('1', { finishedToday: true });
    expect(ultimoSet.next_up).toBe(false);
  });

  it('continua na fila ao virar lendo', async () => {
    livroAtual = { read_status: 'não lido', owned: true, next_up: true, favorite: false };
    await PATCH('1', { readStatus: 'lendo' });
    expect(ultimoSet.next_up).toBeUndefined();
  });
});

describe('favoritos (AD-7)', () => {
  it('marca livro lido', async () => {
    livroAtual = { read_status: 'lido', owned: true, next_up: false, favorite: false };
    const res = await PATCH('1', { favorite: true });
    expect(res.status).toBe(200);
    expect(ultimoSet.favorite).toBe(true);
  });

  it('recusa livro que não está lido', async () => {
    livroAtual = { read_status: 'lendo', owned: true, next_up: false, favorite: false };
    expect((await PATCH('1', { favorite: true })).status).toBe(409);
  });

  it('aceita marcar como lido e favoritar no mesmo pedido', async () => {
    livroAtual = { read_status: 'lendo', owned: true, next_up: false, favorite: false };
    const res = await PATCH('1', { readStatus: 'lido', favorite: true });
    expect(res.status).toBe(200);
    expect(ultimoSet.favorite).toBe(true);
  });

  it('não some quando o livro volta a lendo — releitura (AD-7)', async () => {
    livroAtual = { read_status: 'lido', owned: true, next_up: false, favorite: true };
    await PATCH('1', { readStatus: 'lendo' });
    expect(ultimoSet.favorite).toBeUndefined();
  });

  it('aceita desmarcar', async () => {
    livroAtual = { read_status: 'lido', owned: true, next_up: false, favorite: true };
    await PATCH('1', { favorite: false });
    expect(ultimoSet.favorite).toBe(false);
  });
});
