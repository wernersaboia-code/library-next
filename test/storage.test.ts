import { describe, it, expect, vi, beforeEach } from 'vitest';

const upload = vi.fn();
const getPublicUrl = vi.fn(() => ({
  data: { publicUrl: 'https://cdn/x.jpg' },
}));
const createSignedUrl = vi.fn(async (): Promise<{
  data: { signedUrl: string } | null;
  error: { message: string } | null;
}> => ({
  data: { signedUrl: 'https://cdn/signed' }, error: null,
}));
const from = vi.fn(() => ({ upload, getPublicUrl, createSignedUrl }));

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

  it('devolve a signedUrl gerada pelo Supabase', async () => {
    createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://cdn/signed-especial' }, error: null,
    });
    const { createSignedUrl: createSignedUrlFn } = await import('@/lib/storage');
    const url = await createSignedUrlFn('u1/42/book.pdf');
    expect(url).toBe('https://cdn/signed-especial');
  });

  it('usa 3600s por padrão e repassa valor explícito ao SDK', async () => {
    const { createSignedUrl: createSignedUrlFn } = await import('@/lib/storage');

    await createSignedUrlFn('u1/42/book.pdf');
    expect(createSignedUrl).toHaveBeenCalledWith('u1/42/book.pdf', 3600);

    await createSignedUrlFn('u1/42/book.pdf', 120);
    expect(createSignedUrl).toHaveBeenCalledWith('u1/42/book.pdf', 120);
  });

  it('lança em português quando o SDK falha ao gerar a URL assinada', async () => {
    createSignedUrl.mockResolvedValueOnce({
      data: null, error: { message: 'not found' },
    });
    const { createSignedUrl: createSignedUrlFn } = await import('@/lib/storage');
    await expect(createSignedUrlFn('u1/42/book.pdf')).rejects.toThrow(
      /Falha ao gerar URL assinada/
    );
  });

  it('opera sobre o bucket books, não covers', async () => {
    const { createSignedUrl: createSignedUrlFn, BOOKS_BUCKET } = await import(
      '@/lib/storage'
    );
    await createSignedUrlFn('u1/42/book.pdf');
    expect(from).toHaveBeenCalledWith(BOOKS_BUCKET);
    expect(from).not.toHaveBeenCalledWith('covers');
  });
});
