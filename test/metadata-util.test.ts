import { describe, it, expect } from 'vitest';
import { cleanIsbn, toIsbn13 } from '@/lib/metadata/util';
import { normalizeLanguage } from '@/lib/languages';

describe('identificadores de catálogo', () => {
  it('valida e converte ISBN-10, inclusive com X', () => {
    expect(toIsbn13('0-441-01359-7')).toBe('9780441013593');
    expect(cleanIsbn('0-8044-2957-X')).toBe('080442957X');
    expect(toIsbn13('urn:isbn:978-0-441-01359-3')).toBe('9780441013593');
  });
  it('recusa checksum inválido, texto misturado e X fora do dígito de controle', () => {
    for (const value of ['1111111111111', '9780441013594', '123X567890', 'livro9780441013593']) {
      expect(toIsbn13(value)).toBeNull();
    }
  });
  it('normaliza os códigos das fontes para os usados pelo catálogo', () => {
    expect(normalizeLanguage('pt-BR')).toBe('por');
    expect(normalizeLanguage('eng')).toBe('en');
    expect(normalizeLanguage('de')).toBe('ger');
    expect(normalizeLanguage('fra')).toBe('fre');
    expect(normalizeLanguage('????')).toBeNull();
  });
});
