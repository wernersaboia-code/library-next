import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthError } from '@/lib/auth-user';

// Prova que a rota de stats passa por withUser (logo, sob RLS escopado
// por usuário) em vez de bater no db singleton sem app.user_id definido.

const withUserMock = vi.fn();
const getCurrentUserIdMock = vi.fn(async () => 'u-1');

vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: () => getCurrentUserIdMock(),
  AuthError: class AuthError extends Error {},
}));

vi.mock('@/lib/db/with-user', () => ({
  withUser: (uid: string, fn: unknown) => withUserMock(uid, fn),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserIdMock.mockResolvedValue('u-1');
  // Por padrão o callback não é executado; cada teste define o retorno.
  withUserMock.mockResolvedValue(undefined);
});

describe('GET /api/reading/stats', () => {
  it('roda todas as agregações dentro de withUser, escopadas ao usuário', async () => {
    withUserMock.mockResolvedValue({
      totalBooks: 10,
      lendo: 2,
      lidos: 3,
      paginasLidas: 400,
    });

    const mod = await import('@/app/api/reading/stats/route');
    const res = await mod.GET();

    expect(res.status).toBe(200);
    // A prova central: a query passou por withUser com o id do usuário atual.
    expect(withUserMock).toHaveBeenCalledTimes(1);
    expect(withUserMock.mock.calls[0][0]).toBe('u-1');

    const body = await res.json();
    expect(body.totalBooks).toBe(10);
    expect(body.naoLidos).toBe(5); // 10 - 2 - 3
  });

  it('devolve 401 quando não há sessão (AuthError)', async () => {
    getCurrentUserIdMock.mockRejectedValue(new AuthError('Sessão inválida'));

    const mod = await import('@/app/api/reading/stats/route');
    const res = await mod.GET();

    expect(res.status).toBe(401);
    expect(withUserMock).not.toHaveBeenCalled();
  });
});
