import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '@/lib/auth-error';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), run: vi.fn(), list: vi.fn(), values: vi.fn(), where: vi.fn() }));
vi.mock('@/lib/auth-user', () => ({ getCurrentUserId: mocks.auth }));
vi.mock('@/lib/db/with-user', () => ({ withUser: mocks.run }));
vi.mock('@/lib/db/saved-searches', () => ({ fetchSavedSearches: mocks.list }));
import { GET, POST, DELETE } from '@/app/api/saved-searches/route';

beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue('user-a');
  mocks.list.mockResolvedValue([]);
  mocks.values.mockReturnValue({ returning: async () => [{ id: 1, name: 'Curtos', query: 'pgs=200' }] });
  mocks.where.mockReturnValue({ returning: async () => [] });
  mocks.run.mockImplementation(async (_id, fn) => fn({ insert: () => ({ values: mocks.values }), delete: () => ({ where: mocks.where }) }));
});
const request = (body: unknown) => new Request('http://localhost/api/saved-searches', { method: 'POST', body: JSON.stringify(body) });

describe('API de estantes dinâmicas', () => {
  it('lista somente as estantes da sessão', async () => {
    expect((await GET()).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith('user-a');
  });
  it('salva filtros sem página, com dono definido pelo servidor', async () => {
    expect((await POST(request({ name: ' Curtos ', query: 'pgs=200&page=3', userId: 'other' }))).status).toBe(201);
    expect(mocks.values).toHaveBeenCalledWith({ userId: 'user-a', name: 'Curtos', query: 'pgs=200' });
  });
  it('rejeita entrada inválida e JSON malformado', async () => {
    for (const body of [null, {}, { name: 'x', query: 'page=3' }]) expect((await POST(request(body))).status).toBe(400);
    expect((await POST(new Request('http://localhost', { method: 'POST', body: '{' }))).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('informa nomes repetidos', async () => {
    for (const error of [{ code: '23505' }, { cause: { code: '23505' } }]) {
      mocks.run.mockRejectedValue(error);
      expect((await POST(request({ name: 'x', query: 'lng=por' }))).status).toBe(409);
    }
  });
  it('não informa existência de uma estante de outro usuário ao remover', async () => {
    const response = await DELETE(new Request('http://localhost/api/saved-searches?id=7'));
    expect(response.status).toBe(404);
    expect(mocks.run).toHaveBeenCalledWith('user-a', expect.any(Function));
    expect(mocks.where).toHaveBeenCalled();
  });
  it('recusa operações sem sessão', async () => {
    mocks.auth.mockRejectedValue(new AuthError());
    expect((await POST(request({ name: 'x', query: 'lng=por' }))).status).toBe(401);
    expect((await DELETE(new Request('http://localhost/api/saved-searches?id=1'))).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
