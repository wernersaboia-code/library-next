import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();

vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));

async function chamar(metodo: 'POST' | 'DELETE', id: string, body: unknown) {
  const mod = await import('@/app/api/collections/[id]/books/route');
  const req = new Request(`http://x/api/collections/${id}/books`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ctx = { params: Promise.resolve({ id }) };
  return metodo === 'POST' ? mod.POST(req, ctx) : mod.DELETE(req, ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  run.mockResolvedValue(2);   // o handler devolve a contagem de linhas afetadas
});

describe('POST /api/collections/[id]/books', () => {
  it('vincula um lote e informa quantos entraram', async () => {
    const res = await chamar('POST', '7', { bookIds: [1, 2] });
    expect(res.status).toBe(200);
    expect((await res.json()).adicionados).toBe(2);
  });

  it('aceita um único livro (mesma rota da marcação individual, AD-6)', async () => {
    run.mockResolvedValue(1);
    const res = await chamar('POST', '7', { bookIds: [42] });
    expect(res.status).toBe(200);
    expect((await res.json()).adicionados).toBe(1);
  });

  it('repetir livro já vinculado não é erro e conta zero (AD-6)', async () => {
    run.mockResolvedValue(0);
    const res = await chamar('POST', '7', { bookIds: [1] });
    expect(res.status).toBe(200);
    expect((await res.json()).adicionados).toBe(0);
  });

  it('biblioteca inexistente responde 404', async () => {
    run.mockResolvedValue(null);   // o handler devolve null quando não acha
    expect((await chamar('POST', '7', { bookIds: [1] })).status).toBe(404);
  });

  it('recusa lista vazia com 400', async () => {
    const res = await chamar('POST', '7', { bookIds: [] });
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('recusa bookIds ausente com 400', async () => {
    expect((await chamar('POST', '7', {})).status).toBe(400);
  });

  it('recusa id de livro não numérico com 400', async () => {
    expect((await chamar('POST', '7', { bookIds: ['abc'] })).status).toBe(400);
  });

  it('recusa mais de 200 livros com 400', async () => {
    const muitos = Array.from({ length: 201 }, (_, i) => i + 1);
    const res = await chamar('POST', '7', { bookIds: muitos });
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('recusa id de biblioteca não numérico com 400', async () => {
    expect((await chamar('POST', 'abc', { bookIds: [1] })).status).toBe(400);
  });
});

describe('DELETE /api/collections/[id]/books', () => {
  it('desvincula um lote', async () => {
    const res = await chamar('DELETE', '7', { bookIds: [1, 2] });
    expect(res.status).toBe(200);
    expect((await res.json()).removidos).toBe(2);
  });

  it('biblioteca inexistente responde 404', async () => {
    run.mockResolvedValue(null);
    expect((await chamar('DELETE', '7', { bookIds: [1] })).status).toBe(404);
  });
});
