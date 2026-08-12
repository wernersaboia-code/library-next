import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const selecionado = vi.fn();

vi.mock('@/lib/auth', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  getDriveToken: vi.fn(async () => 'tok'),
}));

vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, _fn: unknown) => selecionado()),
}));

vi.mock('@/lib/storage', () => ({
  createSignedUrl: vi.fn(async () => 'https://cdn/assinada?token=x'),
  StorageQuotaError: class extends Error {},
}));

async function GET(url: string, init?: RequestInit) {
  const mod = await import('@/app/api/drive/read/route');
  return mod.GET(new Request(url, init));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('GET /api/drive/read', () => {
  it('redireciona para signed URL quando o arquivo está cacheado', async () => {
    selecionado.mockResolvedValue([{
      fileId: 'f1', mimeType: 'application/epub+zip',
      cachedPath: 'u-1/1/book.epub',
    }]);

    const res = await GET('http://x/api/drive/read?bookId=1');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://cdn/assinada?token=x');
  });

  it('faz proxy do Drive quando não há cache', async () => {
    selecionado.mockResolvedValue([{
      fileId: 'f1', mimeType: 'application/epub+zip', cachedPath: null,
    }]);
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('conteudo', { status: 200 })));

    const res = await GET('http://x/api/drive/read?bookId=1');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('conteudo');
  });

  it('repassa o header Range ao Drive e devolve 206', async () => {
    selecionado.mockResolvedValue([{
      fileId: 'f1', mimeType: 'application/pdf', cachedPath: null,
    }]);
    const spy = vi.fn(async () => new Response('parcial', {
      status: 206,
      headers: { 'content-range': 'bytes 0-1023/999999' },
    }));
    vi.stubGlobal('fetch', spy);

    const res = await GET('http://x/api/drive/read?bookId=1', {
      headers: { Range: 'bytes=0-1023' },
    });

    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Range: 'bytes=0-1023' }),
      })
    );
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-1023/999999');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
  });

  it('devolve 404 para livro de outro usuário', async () => {
    selecionado.mockResolvedValue([]); // o RLS filtrou tudo
    const res = await GET('http://x/api/drive/read?bookId=999');
    expect(res.status).toBe(404);
  });

  it('rejeita bookId não numérico', async () => {
    const res = await GET('http://x/api/drive/read?bookId=abc');
    expect(res.status).toBe(400);
  });

  it('não devolve Access-Control-Allow-Origin', async () => {
    selecionado.mockResolvedValue([{
      fileId: 'f1', mimeType: 'application/epub+zip', cachedPath: null,
    }]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 200 })));

    const res = await GET('http://x/api/drive/read?bookId=1');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
