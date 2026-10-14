import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '@/lib/auth-error';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/auth-user', () => ({ getCurrentUserId: mocks.auth }));
vi.mock('@/lib/db/reading-export', () => ({ fetchReadingExport: mocks.load }));
import { GET } from '@/app/api/reading/export/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue('user-a');
  mocks.load.mockResolvedValue({ books: [], notes: [] });
});

describe('download de dados pessoais', () => {
  it('gera anexo privado usando exclusivamente o usuário autenticado', async () => {
    const response = await GET(new Request('http://localhost/api/reading/export?format=csv&userId=other'));
    expect(response.status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith('user-a');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
  });
  it('recusa formato desconhecido antes de consultar dados', async () => {
    expect((await GET(new Request('http://localhost/api/reading/export?format=exe'))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('recusa acesso sem sessão', async () => {
    mocks.auth.mockRejectedValue(new AuthError());
    expect((await GET(new Request('http://localhost/api/reading/export?format=md'))).status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
