import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
let inserido: Record<string, unknown> | null = null;
let linhasSelect: unknown[] = [];
let linhasDelete: { id: string }[] = [];

vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));

async function chamar(method: string, id: string, body?: unknown) {
  const mod = await import('@/app/api/books/[id]/bookmarks/route');
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const req = new Request(`http://x/api/books/${id}/bookmarks`, init);
  const ctx = { params: Promise.resolve({ id }) };
  if (method === 'GET') return mod.GET(req, ctx);
  if (method === 'POST') return mod.POST(req, ctx);
  return mod.DELETE(req, ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  inserido = null;
  linhasSelect = [];
  linhasDelete = [];
  run.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      select: () => ({
        from: () => ({ where: () => ({ orderBy: async () => linhasSelect }) }),
      }),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          inserido = v;
          return { returning: async () => [{ id: 'novo' }] };
        },
      }),
      delete: () => ({
        where: () => ({ returning: async () => linhasDelete }),
      }),
    };
    return fn(tx);
  });
});

describe('GET marcadores', () => {
  it('devolve a lista do livro', async () => {
    linhasSelect = [{ id: 'b1', locator: { format: 'pdf', page: 10 } }];
    const res = await chamar('GET', '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(linhasSelect);
  });

  it('recusa id inválido', async () => {
    expect((await chamar('GET', 'abc')).status).toBe(400);
  });
});

describe('POST marcador', () => {
  it('grava locator de EPUB com label', async () => {
    const res = await chamar('POST', '7', {
      locator: { format: 'epub', cfi: 'epubcfi(/6/4!/2/2)', href: 'c1.xhtml' },
      label: '  42%  ',
    });
    expect(res.status).toBe(200);
    expect(inserido).toMatchObject({
      userId: 'u-1',
      bookId: 7,
      locator: { format: 'epub', cfi: 'epubcfi(/6/4!/2/2)', href: 'c1.xhtml' },
      label: '42%',
    });
  });

  it('grava locator de PDF pela página', async () => {
    await chamar('POST', '7', { locator: { format: 'pdf', page: 12 } });
    expect(inserido?.locator).toEqual({ format: 'pdf', page: 12 });
    expect(inserido?.label).toBeNull();
  });

  it('recusa locator sem cfi', async () => {
    const res = await chamar('POST', '7', { locator: { format: 'epub' } });
    expect(res.status).toBe(400);
    expect(inserido).toBeNull();
  });

  it('recusa PDF com página inválida', async () => {
    expect((await chamar('POST', '7', { locator: { format: 'pdf', page: 0 } })).status).toBe(400);
    expect((await chamar('POST', '7', { locator: { format: 'pdf', page: 1.5 } })).status).toBe(400);
  });

  it('recusa locator ausente', async () => {
    expect((await chamar('POST', '7', {})).status).toBe(400);
  });
});

describe('DELETE marcador', () => {
  it('apaga o marcador existente', async () => {
    linhasDelete = [{ id: 'b1' }];
    const res = await chamar('DELETE', '7', { bookmarkId: 'b1' });
    expect(res.status).toBe(200);
  });

  it('404 quando não encontra', async () => {
    const res = await chamar('DELETE', '7', { bookmarkId: 'nao-existe' });
    expect(res.status).toBe(404);
  });

  it('recusa sem bookmarkId', async () => {
    expect((await chamar('DELETE', '7', {})).status).toBe(400);
  });
});
