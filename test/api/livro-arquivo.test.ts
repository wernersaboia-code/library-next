import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── estado que os mocks devolvem ───────────────────────────────────────
const run = vi.fn();
let livroDoDono = true;
let valoresInseridos: Record<string, unknown>[] = [];
let setsDeUpdate: Record<string, unknown>[] = [];
let conflito: Record<string, unknown> | null = null;
let tamanhoNoStorage: number | null = 3 * 1024 * 1024;
let caminhoPedido: string | null = null;
const assinatura = vi.fn(async () => ({
  path: 'u-1/1/book.epub',
  signedUrl: 'https://storage.test/upload?token=abc',
}));

vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));

vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));

vi.mock('@/lib/storage', () => ({
  BOOK_FILES_BUCKET: 'book-files',
  bookFilePath: (userId: string, bookId: number, ext: string) =>
    `${userId}/${bookId}/book.${ext}`,
  createSignedBookUpload: () => assinatura(),
  tamanhoDoObjeto: async (_bucket: string, path: string) => {
    caminhoPedido = path;
    return tamanhoNoStorage;
  },
}));

// ── chamadas à rota ────────────────────────────────────────────────────
async function POST(id: string, body: unknown) {
  const mod = await import('@/app/api/books/[id]/file/route');
  return mod.POST(
    new Request(`http://x/api/books/${id}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

async function PUT(id: string, body: unknown) {
  const mod = await import('@/app/api/books/[id]/file/route');
  return mod.PUT(
    new Request(`http://x/api/books/${id}/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  livroDoDono = true;
  valoresInseridos = [];
  setsDeUpdate = [];
  conflito = null;
  tamanhoNoStorage = 3 * 1024 * 1024;
  caminhoPedido = null;
  run.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => (livroDoDono ? [{ id: 1 }] : []) }),
        }),
      }),
      insert: () => ({
        values: (valores: Record<string, unknown>) => ({
          onConflictDoUpdate: async (cfg: Record<string, unknown>) => {
            valoresInseridos.push(valores);
            conflito = cfg;
          },
        }),
      }),
      update: () => ({
        set: (valores: Record<string, unknown>) => ({
          where: async () => {
            setsDeUpdate.push(valores);
          },
        }),
      }),
    };
    return fn(tx);
  });
});

describe('POST /api/books/[id]/file — preparar o envio', () => {
  it('assina uma URL para o EPUB escolhido', async () => {
    const res = await POST('1', { nome: 'O Cortiço.epub', tamanho: 1024 * 1024 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      signedUrl: 'https://storage.test/upload?token=abc',
      formato: 'epub',
      mime: 'application/epub+zip',
    });
  });

  it('recusa o que não é EPUB nem PDF, antes de subir qualquer byte', async () => {
    const res = await POST('1', { nome: 'livro.mobi', tamanho: 1024 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/EPUB ou PDF/);
    expect(assinatura).not.toHaveBeenCalled();
  });

  it('recusa arquivo gigante', async () => {
    const res = await POST('1', { nome: 'scan.pdf', tamanho: 400 * 1024 * 1024 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/limite/);
    expect(assinatura).not.toHaveBeenCalled();
  });

  it('recusa arquivo vazio', async () => {
    const res = await POST('1', { nome: 'livro.epub', tamanho: 0 });
    expect(res.status).toBe(400);
    expect(assinatura).not.toHaveBeenCalled();
  });

  it('não assina para livro de outra pessoa', async () => {
    livroDoDono = false;
    const res = await POST('1', { nome: 'livro.epub', tamanho: 1024 });
    expect(res.status).toBe(404);
    expect(assinatura).not.toHaveBeenCalled();
  });

  it('recusa id que não é número', async () => {
    expect((await POST('abc', { nome: 'livro.epub', tamanho: 10 })).status).toBe(400);
  });
});

describe('PUT /api/books/[id]/file — registrar o que chegou', () => {
  it('grava o arquivo e marca o livro como pronto', async () => {
    const res = await PUT('1', { formato: 'epub', sha256: 'A'.repeat(64) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, formato: 'epub', size: 3 * 1024 * 1024 });

    expect(caminhoPedido).toBe('u-1/1/book.epub');
    expect(valoresInseridos).toHaveLength(1);
    expect(valoresInseridos[0]).toMatchObject({
      userId: 'u-1',
      bookId: 1,
      format: 'epub',
      storagePath: 'u-1/1/book.epub',
      mime: 'application/epub+zip',
      size: 3 * 1024 * 1024,
      hasFile: true,
    });
    // o tamanho vem do Storage medido, e o hash é normalizado
    expect(valoresInseridos[0].sha256).toBe('a'.repeat(64));
    expect(conflito).not.toBeNull();
    expect(setsDeUpdate).toContainEqual({ has_file: true });
  });

  it('grava sem hash quando o navegador não mandou um válido', async () => {
    await PUT('1', { formato: 'pdf', sha256: 'lixo' });
    expect(valoresInseridos[0].sha256).toBe(null);
    expect(valoresInseridos[0].format).toBe('pdf');
  });

  it('não registra se o arquivo não chegou ao Storage', async () => {
    tamanhoNoStorage = null;
    const res = await PUT('1', { formato: 'epub' });
    expect(res.status).toBe(409);
    expect(valoresInseridos).toHaveLength(0);
    expect(setsDeUpdate).toHaveLength(0);
  });

  it('não registra arquivo vazio no Storage', async () => {
    tamanhoNoStorage = 0;
    expect((await PUT('1', { formato: 'epub' })).status).toBe(409);
  });

  it('recusa o que passou do limite na subida', async () => {
    tamanhoNoStorage = 400 * 1024 * 1024;
    const res = await PUT('1', { formato: 'epub' });
    expect(res.status).toBe(400);
    expect(valoresInseridos).toHaveLength(0);
  });

  it('recusa formato desconhecido', async () => {
    expect((await PUT('1', { formato: 'mobi' })).status).toBe(400);
    expect(tamanhoNoStorage).not.toBeNull();
  });

  it('não registra para livro de outra pessoa', async () => {
    livroDoDono = false;
    expect((await PUT('1', { formato: 'epub' })).status).toBe(404);
    expect(valoresInseridos).toHaveLength(0);
  });
});
