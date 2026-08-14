import { describe, it, expect, vi, beforeEach } from 'vitest';

const buscar = vi.fn();
vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/openlibrary', () => ({
  searchExternalBooks: (q: string) => buscar(q),
  ExternalSearchError: class ExternalSearchError extends Error {},
}));

async function GET(url: string) {
  const mod = await import('@/app/api/books/search-external/route');
  return mod.GET(new Request(url));
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/books/search-external', () => {
  it('devolve os candidatos', async () => {
    buscar.mockResolvedValue([{ title: 'The Shining', ratingsAverage: 4.3, ratingsCount: 1847 }]);
    const res = await GET('http://x/api/books/search-external?q=shining');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultados).toHaveLength(1);
    expect(buscar).toHaveBeenCalledWith('shining');
  });

  it('recusa busca vazia com 400', async () => {
    const res = await GET('http://x/api/books/search-external?q=%20%20');
    expect(res.status).toBe(400);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('recusa q ausente com 400', async () => {
    expect((await GET('http://x/api/books/search-external')).status).toBe(400);
  });

  it('devolve 503 quando a Open Library falha', async () => {
    const { ExternalSearchError } = await import('@/lib/openlibrary');
    buscar.mockRejectedValue(new ExternalSearchError('falhou'));
    const res = await GET('http://x/api/books/search-external?q=x');
    expect(res.status).toBe(503);
  });
});
