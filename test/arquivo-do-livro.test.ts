import { describe, it, expect } from 'vitest';
import {
  formatoDoArquivo,
  validarArquivo,
  emMegabytes,
  limiteEmMegabytes,
  TAMANHO_MAXIMO_PADRAO,
} from '@/lib/arquivo-do-livro';

describe('formatoDoArquivo', () => {
  it('reconhece EPUB e PDF', () => {
    expect(formatoDoArquivo('O Cortiço.epub')).toBe('epub');
    expect(formatoDoArquivo('manual.pdf')).toBe('pdf');
  });

  it('não se importa com maiúsculas', () => {
    expect(formatoDoArquivo('LIVRO.EPUB')).toBe('epub');
    expect(formatoDoArquivo('Scan.PDF')).toBe('pdf');
  });

  it('recusa o que não é EPUB nem PDF', () => {
    expect(formatoDoArquivo('livro.mobi')).toBe(null);
    expect(formatoDoArquivo('capa.jpg')).toBe(null);
    expect(formatoDoArquivo('arquivo')).toBe(null);
  });

  it('olha só a última extensão', () => {
    expect(formatoDoArquivo('backup.epub.zip')).toBe(null);
    expect(formatoDoArquivo('cópia.pdf.epub')).toBe('epub');
  });
});

describe('validarArquivo', () => {
  it('aceita um EPUB dentro do limite e já devolve o mime', () => {
    expect(validarArquivo('livro.epub', 3 * 1024 * 1024)).toEqual({
      ok: true,
      formato: 'epub',
      mime: 'application/epub+zip',
    });
  });

  it('aceita PDF', () => {
    const r = validarArquivo('digitalizado.pdf', 1024);
    expect(r.ok && r.mime).toBe('application/pdf');
  });

  it('recusa formato desconhecido', () => {
    const r = validarArquivo('livro.mobi', 1024);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/EPUB ou PDF/);
  });

  it('recusa arquivo vazio', () => {
    expect(validarArquivo('livro.epub', 0).ok).toBe(false);
    expect(validarArquivo('livro.epub', Number.NaN).ok).toBe(false);
  });

  it('recusa acima do limite e diz o tamanho na mensagem', () => {
    const r = validarArquivo('livro.pdf', 60 * 1024 * 1024);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain('60,0 MB');
  });

  it('aceita exatamente no limite', () => {
    expect(validarArquivo('livro.pdf', TAMANHO_MAXIMO_PADRAO).ok).toBe(true);
  });

  it('respeita um limite menor passado de fora', () => {
    expect(validarArquivo('livro.epub', 2 * 1024 * 1024, 1024 * 1024).ok).toBe(false);
  });
});

describe('tamanhos em texto', () => {
  it('usa vírgula decimal, como o resto da tela', () => {
    expect(emMegabytes(1024 * 1024 * 12.4)).toBe('12,4 MB');
  });

  it('o limite redondo vira 50 MB', () => {
    expect(limiteEmMegabytes()).toBe(50);
    expect(limiteEmMegabytes(20 * 1024 * 1024)).toBe(20);
  });
});
