import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
const listar = vi.fn();

vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));
vi.mock('@/lib/db/collections', () => ({
  fetchCollections: () => listar(),
}));

async function GET() {
  const mod = await import('@/app/api/collections/route');
  return mod.GET();
}

async function POST(body: unknown) {
  const mod = await import('@/app/api/collections/route');
  return mod.POST(new Request('http://x/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

async function PATCH(id: string, body: unknown) {
  const mod = await import('@/app/api/collections/[id]/route');
  return mod.PATCH(
    new Request(`http://x/api/collections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

async function DELETE(id: string) {
  const mod = await import('@/app/api/collections/[id]/route');
  return mod.DELETE(
    new Request(`http://x/api/collections/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) }
  );
}

/** Erro de violação de índice único, como o postgres-js entrega. */
function erroDuplicado() {
  return Object.assign(new Error('duplicate key value'), { code: '23505' });
}

beforeEach(() => {
  vi.clearAllMocks();
  run.mockResolvedValue([{ id: 7, name: 'Terror' }]);
});

describe('GET /api/collections', () => {
  it('devolve as bibliotecas', async () => {
    listar.mockResolvedValue([{ id: 1, name: 'Terror', total: 3 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).colecoes).toHaveLength(1);
  });
});

describe('POST /api/collections', () => {
  it('cria e devolve a biblioteca', async () => {
    const res = await POST({ name: 'Terror' });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('Terror');
  });

  it('apara espaços do nome', async () => {
    await POST({ name: '  Terror  ' });
    expect(run).toHaveBeenCalled();
  });

  it('recusa nome vazio com 400', async () => {
    const res = await POST({ name: '   ' });
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('recusa nome ausente com 400', async () => {
    expect((await POST({})).status).toBe(400);
  });

  it('nome repetido responde 409, não erro de banco (AD-8)', async () => {
    run.mockRejectedValue(erroDuplicado());
    const res = await POST({ name: 'Terror' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/já existe/i);
  });
});

describe('PATCH /api/collections/[id]', () => {
  it('renomeia', async () => {
    expect((await PATCH('7', { name: 'Horror' })).status).toBe(200);
  });

  it('recusa id não numérico com 400', async () => {
    expect((await PATCH('abc', { name: 'X' })).status).toBe(400);
  });

  it('recusa nome vazio com 400', async () => {
    expect((await PATCH('7', { name: '  ' })).status).toBe(400);
  });

  it('biblioteca inexistente responde 404', async () => {
    run.mockResolvedValue([]);
    expect((await PATCH('7', { name: 'X' })).status).toBe(404);
  });

  it('nome repetido responde 409', async () => {
    run.mockRejectedValue(erroDuplicado());
    expect((await PATCH('7', { name: 'Terror' })).status).toBe(409);
  });
});

describe('DELETE /api/collections/[id]', () => {
  it('apaga', async () => {
    expect((await DELETE('7')).status).toBe(200);
  });

  it('biblioteca inexistente responde 404', async () => {
    run.mockResolvedValue([]);
    expect((await DELETE('7')).status).toBe(404);
  });

  it('recusa id não numérico com 400', async () => {
    expect((await DELETE('abc')).status).toBe(400);
  });
});
