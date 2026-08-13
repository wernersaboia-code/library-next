import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DriveAuthError } from '@/lib/auth-tokens';

// Prova que as rotas de leitura passam por withUser (logo, sob RLS escopado
// por usuário) em vez de bater no db singleton sem app.user_id definido.

const withUserMock = vi.fn();
const getCurrentUserIdMock = vi.fn(async () => 'u-1');

vi.mock('@/lib/auth', () => ({
  getCurrentUserId: () => getCurrentUserIdMock(),
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
      totalMinutes: 120,
      streak: [],
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

  it('devolve 401 quando não há sessão (DriveAuthError)', async () => {
    getCurrentUserIdMock.mockRejectedValue(new DriveAuthError('Sessão inválida'));

    const mod = await import('@/app/api/reading/stats/route');
    const res = await mod.GET();

    expect(res.status).toBe(401);
    expect(withUserMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/reading/annotations', () => {
  it('apaga dentro de withUser — o RLS filtra pelo dono e fecha o IDOR', async () => {
    const mod = await import('@/app/api/reading/annotations/route');
    const res = await mod.DELETE(
      new Request('http://x/api/reading/annotations', {
        method: 'DELETE',
        body: JSON.stringify({ id: 42 }),
      })
    );

    expect(res.status).toBe(200);
    // Sem withUser não há app.user_id → o DELETE por id vazaria cross-user.
    expect(withUserMock).toHaveBeenCalledTimes(1);
    expect(withUserMock.mock.calls[0][0]).toBe('u-1');
  });

  it('rejeita sem id, antes de tocar no banco', async () => {
    const mod = await import('@/app/api/reading/annotations/route');
    const res = await mod.DELETE(
      new Request('http://x/api/reading/annotations', {
        method: 'DELETE',
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(400);
    expect(withUserMock).not.toHaveBeenCalled();
  });

  it('devolve 401 quando não há sessão', async () => {
    getCurrentUserIdMock.mockRejectedValue(new DriveAuthError('Sessão inválida'));

    const mod = await import('@/app/api/reading/annotations/route');
    const res = await mod.DELETE(
      new Request('http://x/api/reading/annotations', {
        method: 'DELETE',
        body: JSON.stringify({ id: 42 }),
      })
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /api/reading/annotations', () => {
  it('lista destaques dentro de withUser', async () => {
    withUserMock.mockResolvedValue([]);

    const mod = await import('@/app/api/reading/annotations/route');
    const res = await mod.GET(
      new Request('http://x/api/reading/annotations?bookId=1')
    );

    expect(res.status).toBe(200);
    expect(withUserMock).toHaveBeenCalledTimes(1);
    expect(withUserMock.mock.calls[0][0]).toBe('u-1');
  });
});

describe('POST /api/reading/heartbeat', () => {
  it('registra tempo dentro de withUser', async () => {
    const mod = await import('@/app/api/reading/heartbeat/route');
    const res = await mod.POST(
      new Request('http://x/api/reading/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ bookId: 1, seconds: 30 }),
      })
    );

    expect(res.status).toBe(200);
    expect(withUserMock).toHaveBeenCalledTimes(1);
    expect(withUserMock.mock.calls[0][0]).toBe('u-1');
  });
});

describe('POST /api/reading/progress', () => {
  it('salva progresso dentro de withUser', async () => {
    const mod = await import('@/app/api/reading/progress/route');
    const res = await mod.POST(
      new Request('http://x/api/reading/progress', {
        method: 'POST',
        body: JSON.stringify({ bookId: 1, cfi: 'epubcfi(/6/4)', percentage: 50 }),
      })
    );

    expect(res.status).toBe(200);
    expect(withUserMock).toHaveBeenCalledTimes(1);
    expect(withUserMock.mock.calls[0][0]).toBe('u-1');
  });
});
