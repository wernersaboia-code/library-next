import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: (tx: unknown) => unknown) => run(fn)),
}));

async function PATCH(id: string, body: unknown) {
  const mod = await import('@/app/api/books/[id]/route');
  return mod.PATCH(
    new Request(`http://x/api/books/${id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => { vi.clearAllMocks(); run.mockResolvedValue([{ id: 1 }]); });

describe('PATCH /api/books/[id]', () => {
  it('atualiza status dentro de withUser', async () => {
    const res = await PATCH('1', { readStatus: 'lido' });
    expect(res.status).toBe(200);
    const { withUser } = await import('@/lib/db/with-user');
    expect(withUser).toHaveBeenCalledWith('u-1', expect.any(Function));
  });

  it('recusa my_rating fora de 1..5', async () => {
    const res = await PATCH('1', { myRating: 9 });
    expect(res.status).toBe(400);
  });

  it('recusa read_status inválido', async () => {
    const res = await PATCH('1', { readStatus: 'talvez' });
    expect(res.status).toBe(400);
  });

  it('recusa id não numérico', async () => {
    const res = await PATCH('abc', { readStatus: 'lido' });
    expect(res.status).toBe(400);
  });
});

describe('/api/books/[id]/notes', () => {
  it('POST cria nota dentro de withUser', async () => {
    run.mockResolvedValue([{ id: 'n-1' }]);
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.POST(
      new Request('http://x/api/books/1/notes', {
        method: 'POST',
        body: JSON.stringify({ kind: 'quote', textContent: 't', note: 'c' }),
      }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const { withUser } = await import('@/lib/db/with-user');
    expect(withUser).toHaveBeenCalledWith('u-1', expect.any(Function));
  });

  it('POST recusa kind inválido', async () => {
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.POST(
      new Request('http://x/api/books/1/notes', {
        method: 'POST',
        body: JSON.stringify({ kind: 'bookmark' }),
      }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('POST recusa id de livro não numérico', async () => {
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.POST(
      new Request('http://x/api/books/abc/notes', {
        method: 'POST',
        body: JSON.stringify({ kind: 'note', note: 'c' }),
      }),
      { params: Promise.resolve({ id: 'abc' }) }
    );
    expect(res.status).toBe(400);
  });

  it('GET lista notas do livro dentro de withUser', async () => {
    run.mockResolvedValue([{ id: 'n-1', bookId: 1, kind: 'note', note: 'c' }]);
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.GET(
      new Request('http://x/api/books/1/notes'),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: 'n-1', bookId: 1, kind: 'note', note: 'c' }]);
    const { withUser } = await import('@/lib/db/with-user');
    expect(withUser).toHaveBeenCalledWith('u-1', expect.any(Function));
  });

  it('PATCH edita nota dentro de withUser', async () => {
    run.mockResolvedValue([{ id: 'n-1' }]);
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.PATCH(
      new Request('http://x/api/books/1/notes', {
        method: 'PATCH',
        body: JSON.stringify({ noteId: 'n-1', note: 'atualizado' }),
      }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const { withUser } = await import('@/lib/db/with-user');
    expect(withUser).toHaveBeenCalledWith('u-1', expect.any(Function));
  });

  it('PATCH sem noteId → 400', async () => {
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.PATCH(
      new Request('http://x/api/books/1/notes', {
        method: 'PATCH',
        body: JSON.stringify({ note: 'atualizado' }),
      }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('PATCH sem campos para atualizar → 400', async () => {
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.PATCH(
      new Request('http://x/api/books/1/notes', {
        method: 'PATCH',
        body: JSON.stringify({ noteId: 'n-1' }),
      }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('DELETE remove nota dentro de withUser', async () => {
    run.mockResolvedValue([{ id: 'n-1' }]);
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.DELETE(
      new Request('http://x/api/books/1/notes', {
        method: 'DELETE',
        body: JSON.stringify({ noteId: 'n-1' }),
      }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const { withUser } = await import('@/lib/db/with-user');
    expect(withUser).toHaveBeenCalledWith('u-1', expect.any(Function));
  });

  it('DELETE sem noteId → 400', async () => {
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.DELETE(
      new Request('http://x/api/books/1/notes', {
        method: 'DELETE',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('DELETE nota inexistente → 404', async () => {
    run.mockResolvedValue([]);
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.DELETE(
      new Request('http://x/api/books/1/notes', {
        method: 'DELETE',
        body: JSON.stringify({ noteId: 'n-404' }),
      }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(404);
  });
});
