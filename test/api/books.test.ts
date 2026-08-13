import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: (tx: unknown) => unknown) => run(fn)),
}));

async function PATCH(id: string, body: unknown) {
  const mod = await import('@/app/api/books/[id]/route');
  return mod.PATCH(
    new Request(`http://x/api/books/${id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => { vi.clearAllMocks(); run.mockResolvedValue([{ id: 1 }]); });

describe('PATCH /api/books/[id]', () => {
  it('atualiza status dentro de withUser', async () => {
    const res = await PATCH('1', { readStatus: 'lido' });
    expect(res.status).toBe(200);
    const { withUser } = await import('@/lib/db/with-user');
    expect(withUser).toHaveBeenCalledWith('u-1', expect.any(Function));
  });

  it('recusa my_rating fora de 1..5', async () => {
    const res = await PATCH('1', { myRating: 9 });
    expect(res.status).toBe(400);
  });

  it('recusa read_status inválido', async () => {
    const res = await PATCH('1', { readStatus: 'talvez' });
    expect(res.status).toBe(400);
  });

  it('recusa id não numérico', async () => {
    const res = await PATCH('abc', { readStatus: 'lido' });
    expect(res.status).toBe(400);
  });
});
