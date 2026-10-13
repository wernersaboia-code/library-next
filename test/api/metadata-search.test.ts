import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ search: vi.fn(), rate: vi.fn() }));
vi.mock('@/lib/auth-user', () => ({ getCurrentUserId: async () => 'owner', AuthError: class extends Error {} }));
vi.mock('@/lib/metadata', () => ({ searchMetadata: state.search }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: state.rate }));
import { GET } from '@/app/api/books/metadata/route';
beforeEach(() => { vi.clearAllMocks(); state.rate.mockReturnValue({ allowed: true }); });

describe('busca de metadados', () => {
  it('distingue ausência de resultados de indisponibilidade total', async () => {
    state.search.mockResolvedValue({ books: [], falhas: [{ source: 'openlibrary', message: 'error' }], allFailed: false });
    expect((await GET(new Request('https://test/api/books/metadata?q=Livro'))).status).toBe(200);
    state.search.mockResolvedValue({ books: [], falhas: [], allFailed: true });
    expect((await GET(new Request('https://test/api/books/metadata?q=Livro'))).status).toBe(503);
  });
  it('aplica o limite de frequência e valida a consulta antes de chamar fontes', async () => {
    expect((await GET(new Request('https://test/api/books/metadata'))).status).toBe(400);
    expect((await GET(new Request('https://test/api/books/metadata?q=' + 'x'.repeat(301)))).status).toBe(400);
    state.rate.mockReturnValue({ allowed: false, retryAfter: 20 });
    const response = await GET(new Request('https://test/api/books/metadata?q=Livro'));
    expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBe('20');
    expect(state.search).not.toHaveBeenCalled();
  });
});
