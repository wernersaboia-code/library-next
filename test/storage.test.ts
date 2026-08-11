import { describe, it, expect, vi, beforeEach } from 'vitest';

const upload = vi.fn();
const getPublicUrl = vi.fn(() => ({
  data: { publicUrl: 'https://cdn/x.jpg' },
}));
const createSignedUrl = vi.fn(async () => ({
  data: { signedUrl: 'https://cdn/signed' }, error: null,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ upload, getPublicUrl, createSignedUrl }) },
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

  it('converte estouro de quota em StorageQuotaError', async () => {
    upload.mockResolvedValue({
      data: null, error: { message: 'exceeded the maximum allowed size' },
    });
    const { uploadBookFile, StorageQuotaError } = await import('@/lib/storage');
    await expect(
      uploadBookFile('u1', 42, Buffer.from('x'), 'application/epub+zip')
    ).rejects.toBeInstanceOf(StorageQuotaError);
  });

  it('usa a extensão certa por mime type', async () => {
    upload.mockResolvedValue({ data: { path: 'p' }, error: null });
    const { uploadBookFile } = await import('@/lib/storage');
    const path = await uploadBookFile(
      'u1', 7, Buffer.from('x'), 'application/pdf'
    );
    expect(path).toBe('u1/7/book.pdf');
  });
});
