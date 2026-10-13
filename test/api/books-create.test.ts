import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));
vi.mock('@/lib/db/duplicates', () => ({ findDuplicates: vi.fn(async () => []) }));

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

beforeEach(async () => {
  vi.clearAllMocks(); run.mockResolvedValue({ bookId: 1 });
  const { findDuplicates } = await import('@/lib/db/duplicates');
  vi.mocked(findDuplicates).mockResolvedValue([]);
});

describe('POST /api/books', () => {
  it('cria livro manual dentro de withUser', async () => {
    run.mockResolvedValue({ bookId: 1 });
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

  it('aceita título original no cadastro manual', async () => {
    const res = await POST({
      title: 'Duna', originalTitle: 'Dune', owned: false,
    });
    expect(res.status).toBe(200);
  });

  it('recusa averageRating fora de 0..5', async () => {
    expect((await POST({ title: 'X', averageRating: 9 })).status).toBe(400);
  });

  it('persiste ISBN, idioma e sinopse encontrados na busca', async () => {
    const values = vi.fn(() => ({ returning: async () => [{ id: 1 }] }));
    run.mockImplementation(async (fn) => fn({ insert: () => ({ values }) }));
    const res = await POST({ title: 'Duna', isbn13: '0-441-01359-7', language: 'pt-BR', description: '<p>Sinopse</p>' });
    expect(res.status).toBe(200);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      isbn13: '9780441013593', language_code: 'por', description: '<p>Sinopse</p>',
    }));
  });

  it('recusa ISBN e idioma inválidos antes de gravar', async () => {
    expect((await POST({ title: 'X', isbn13: '1111111111111' })).status).toBe(400);
    expect((await POST({ title: 'X', language: '????' })).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('exige revisão de duplicados antes de inserir e usa somente o usuário autenticado', async () => {
    const { findDuplicates } = await import('@/lib/db/duplicates');
    const duplicate = { id: 9, title: 'Duna', authors: [], isbn13: '9780441013593', sha256: null, hasFile: true, owned: true, reason: 'isbn' as const };
    vi.mocked(findDuplicates).mockResolvedValue([duplicate]);
    const tx = { execute: vi.fn(), insert: vi.fn() };
    run.mockImplementation(async (fn) => fn(tx));
    const res = await POST({ title: 'Duna', isbn13: '9780441013593', userId: 'outra-conta', checkDuplicates: true });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ duplicates: [duplicate] });
    expect(findDuplicates).toHaveBeenCalledWith(tx, 'u-1', expect.objectContaining({ isbn13: '9780441013593' }));
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('permite outra edição quando a pessoa confirma explicitamente', async () => {
    const { findDuplicates } = await import('@/lib/db/duplicates');
    vi.mocked(findDuplicates).mockResolvedValue([{ id: 9, title: 'Duna', authors: [], isbn13: null, sha256: null, hasFile: false, owned: true, reason: 'titulo' }]);
    const values = vi.fn(() => ({ returning: async () => [{ id: 10 }] }));
    run.mockImplementation(async (fn) => fn({ execute: vi.fn(), insert: () => ({ values }) }));
    const res = await POST({ title: 'Duna', checkDuplicates: true, allowDuplicate: true, owned: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ bookId: 10 });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1', owned: true }));
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
