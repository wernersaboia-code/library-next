import { describe, it, expect, vi, afterEach } from 'vitest';
import { refreshGoogleToken } from '@/lib/auth-tokens';

afterEach(() => vi.unstubAllGlobals());

describe('refreshGoogleToken', () => {
  it('troca o refresh token por um access token novo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ access_token: 'novo', expires_in: 3600 }),
            { status: 200 }
          )
      )
    );

    const antes = Date.now();
    const r = await refreshGoogleToken('rt');
    expect(r.accessToken).toBe('novo');
    expect(r.expiresAt).toBeGreaterThan(antes + 3500_000);
  });

  it('propaga o refresh token rotacionado quando o Google devolve um', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'a',
              expires_in: 3600,
              refresh_token: 'rt2',
            }),
            { status: 200 }
          )
      )
    );
    expect((await refreshGoogleToken('rt')).refreshToken).toBe('rt2');
  });

  it('lança quando o Google recusa (acesso revogado)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'invalid_grant' }), {
            status: 400,
          })
      )
    );
    await expect(refreshGoogleToken('rt')).rejects.toThrow(/invalid_grant/);
  });
});
