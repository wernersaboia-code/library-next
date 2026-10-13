import { afterEach, describe, expect, it, vi } from 'vitest';
import { enviarArquivoDoLivro, hashDoArquivo } from '@/lib/book-upload';

afterEach(() => vi.unstubAllGlobals());

describe('envio compartilhado de arquivos', () => {
  it('confirma o registro somente depois do upload direto e conserva o hash', async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(init.method ?? 'GET');
      return Response.json(init.method === 'POST' ? { signedUrl: 'https://storage.test/signed', formato: 'pdf', mime: 'application/pdf' } : { success: true });
    });
    const header = vi.fn();
    class Xhr {
      upload = { onprogress: (_event: unknown) => {} }; status = 200; responseText = '';
      onload = () => {}; onerror = () => {}; open = vi.fn(); setRequestHeader = header;
      send() { calls.push('upload'); this.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 }); this.onload(); }
    }
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('XMLHttpRequest', Xhr);
    const progress = vi.fn();
    await enviarArquivoDoLivro(42, new File(['%PDF-'], 'x.pdf'), 100, progress, 'a'.repeat(64));
    expect(calls).toEqual(['POST', 'upload', 'PUT']);
    expect(progress).toHaveBeenCalledWith(50);
    expect(header).toHaveBeenCalledWith('x-upsert', 'true');
    expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({ formato: 'pdf', sha256: 'a'.repeat(64) });
  });
  it('não confirma no servidor um upload que falhou', async () => {
    const fetch = vi.fn(async () => Response.json({ signedUrl: 'https://storage.test/signed' }));
    class Xhr {
      upload = {}; status = 413; responseText = 'quota exceeded'; onload = () => {};
      open() {} setRequestHeader() {} send() { this.onload(); }
    }
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('XMLHttpRequest', Xhr);
    await expect(enviarArquivoDoLivro(42, new File(['%PDF-'], 'x.pdf'), 100, vi.fn())).rejects.toThrow('armazenamento');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('calcula SHA-256 e permite seguir sem crypto em contexto inseguro', async () => {
    expect(await hashDoArquivo(new File(['abc'], 'x.pdf'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    vi.stubGlobal('crypto', undefined);
    expect(await hashDoArquivo(new File(['abc'], 'x.pdf'))).toBeNull();
  });
});
