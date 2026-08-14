import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
const aplicar = vi.fn(async () => 'https://cdn/nova.jpg');
const baixar = vi.fn(async () => Buffer.from('imagem'));

vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));
vi.mock('@/lib/covers', async () => {
  const real = await vi.importActual<typeof import('@/lib/covers')>('@/lib/covers');
  return { ...real, applyCoverFromBuffer: aplicar, fetchOpenLibraryCover: baixar };
});

async function POST(id: string, body: unknown) {
  const mod = await import('@/app/api/books/[id]/cover/route');
  return mod.POST(
    new Request(`http://x/api/books/${id}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  run.mockResolvedValue('manual');   // o handler consulta o source
});

describe('POST /api/books/[id]/cover', () => {
  it('aplica a capa da Open Library por coverId', async () => {
    const res = await POST('1', { coverId: 12345 });
    expect(res.status).toBe(200);
    expect(baixar).toHaveBeenCalledWith(12345);
    expect(aplicar).toHaveBeenCalled();
  });

  it('recusa livro do Calibre com 409', async () => {
    run.mockResolvedValue('calibre');
    const res = await POST('1', { coverId: 12345 });
    expect(res.status).toBe(409);
    expect(baixar).not.toHaveBeenCalled();
  });

  it('recusa livro inexistente com 404', async () => {
    run.mockResolvedValue(null);
    expect((await POST('1', { coverId: 1 })).status).toBe(404);
  });

  it('recusa id não numérico com 400', async () => {
    expect((await POST('abc', { coverId: 1 })).status).toBe(400);
  });

  it('recusa coverId não numérico com 400', async () => {
    expect((await POST('1', { coverId: 'abc' })).status).toBe(400);
  });

  it('AD-7: recusa URL no lugar do coverId — nunca baixa endereço do cliente', async () => {
    const res = await POST('1', { coverUrl: 'http://169.254.169.254/latest/meta-data/' });
    expect(res.status).toBe(400);
    expect(baixar).not.toHaveBeenCalled();
  });
});
