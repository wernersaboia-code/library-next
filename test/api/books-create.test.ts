import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));

async function POST(body: unknown) {
  const mod = await import('@/app/api/books/route');
  return mod.POST(new Request('http://x/api/books', {
    method: 'POST', body: JSON.stringify(body),
  }));
}

async function DELETE(id: string) {
  const mod = await import('@/app/api/books/[id]/route');
  return mod.DELETE(
    new Request(`http://x/api/books/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => { vi.clearAllMocks(); run.mockResolvedValue([{ id: 1 }]); });

describe('POST /api/books', () => {
  it('cria livro manual dentro de withUser', async () => {
    run.mockResolvedValue(1);
    const res = await POST({ title: 'Meu Desejado', authors: ['Autor X'] });
    expect(res.status).toBe(200);
    const { withUser } = await import('@/lib/db/with-user');
    expect(withUser).toHaveBeenCalledWith('u-1', expect.any(Function));
  });

  it('recusa título vazio', async () => {
    expect((await POST({ title: '   ' })).status).toBe(400);
  });

  it('recusa numPages negativo', async () => {
    expect((await POST({ title: 'X', numPages: -3 })).status).toBe(400);
  });

  it('aceita nota e votos vindos da busca externa', async () => {
    const res = await POST({
      title: 'Da Busca', averageRating: 4.32, ratingsCount: 1847, owned: false,
    });
    expect(res.status).toBe(200);
  });

  it('recusa averageRating fora de 0..5', async () => {
    expect((await POST({ title: 'X', averageRating: 9 })).status).toBe(400);
  });
});

describe('DELETE /api/books/[id]', () => {
  it('apaga livro manual', async () => {
    run.mockResolvedValue('apagado');
    expect((await DELETE('1')).status).toBe(200);
  });

  it('recusa apagar livro do Calibre com 409', async () => {
    // O handler resolve o retorno de withUser para 'do-calibre' quando o
    // livro existe mas source !== 'manual' — ver app/api/books/[id]/route.ts.
    run.mockResolvedValue('do-calibre');
    const res = await DELETE('1');
    expect(res.status).toBe(409);
  });

  it('livro inexistente → 404', async () => {
    run.mockResolvedValue('nao-encontrado');
    const res = await DELETE('1');
    expect(res.status).toBe(404);
  });

  it('recusa id não numérico', async () => {
    expect((await DELETE('abc')).status).toBe(400);
  });
});
