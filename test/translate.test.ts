import { describe, it, expect, vi, afterEach } from 'vitest';

describe('translateText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('traduz via Google Translate REST e devolve o texto', async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = 'chave';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: { translations: [{ translatedText: 'Olá mundo' }] },
      }),
    })));

    const { translateText } = await import('@/lib/translate');
    await expect(translateText('Hello world')).resolves.toBe('Olá mundo');
  });

  it('recusa texto acima do limite', async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = 'chave';
    vi.stubGlobal('fetch', vi.fn());
    const { translateText } = await import('@/lib/translate');
    await expect(translateText('a'.repeat(5001))).rejects.toThrow(/muito longo/);
  });

  it('lança erro quando a API não responde', async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = 'chave';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));
    const { translateText } = await import('@/lib/translate');
    await expect(translateText('x')).rejects.toThrow(/403/);
  });
});
