import { describe, it, expect, vi, beforeEach } from 'vitest';

const upload = vi.fn();
const getPublicUrl = vi.fn(() => ({
  data: { publicUrl: 'https://cdn/x.jpg' },
}));
const from = vi.fn(() => ({ upload, getPublicUrl }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = 'https://p.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
});

describe('storage', () => {
  it('sobe a capa num caminho isolado por usuário', async () => {
    upload.mockResolvedValue({ data: { path: 'p' }, error: null });
    const { uploadCover } = await import('@/lib/storage');
    const url = await uploadCover('u1', 42, Buffer.from('x'), 'jpg');
    expect(upload).toHaveBeenCalledWith(
      'u1/42/cover.jpg', expect.any(Buffer),
      expect.objectContaining({ upsert: true })
    );
    expect(url).toBe('https://cdn/x.jpg');
  });

  it('converte estouro de quota em StorageQuotaError na capa', async () => {
    upload.mockResolvedValue({
      data: null, error: { message: 'exceeded the maximum allowed size' },
    });
    const { uploadCover, StorageQuotaError } = await import('@/lib/storage');
    await expect(
      uploadCover('u1', 42, Buffer.from('x'), 'jpg')
    ).rejects.toBeInstanceOf(StorageQuotaError);
  });

  it('propaga erro genérico da capa como Error comum', async () => {
    upload.mockResolvedValue({
      data: null, error: { message: 'algo inesperado aconteceu' },
    });
    const { uploadCover, StorageQuotaError } = await import('@/lib/storage');
    let caught: unknown;
    try {
      await uploadCover('u1', 42, Buffer.from('x'), 'jpg');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(StorageQuotaError);
  });

  it('rejeita extensão de capa desconhecida', async () => {
    const { uploadCover } = await import('@/lib/storage');
    await expect(
      uploadCover('u1', 42, Buffer.from('x'), 'gif')
    ).rejects.toThrow(/gif/);
    expect(upload).not.toHaveBeenCalled();
  });
});
