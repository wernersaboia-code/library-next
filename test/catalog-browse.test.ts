import { describe, expect, it } from 'vitest';
import { authorHref, browseReturnHref, seriesHref } from '@/lib/catalog-browse';

describe('links de autores e séries', () => {
  it('codifica nomes sem perder barras, acentos ou parâmetros do título', () => {
    const name = 'Crônicas / 100% & C++ ? #1';
    const href = seriesHref(name);
    expect(new URL(href, 'https://test').searchParams.get('nome')).toBe(name);
    expect(authorHref('ana & joão')).toBe('/autores/ana%20%26%20jo%C3%A3o');
    expect(browseReturnHref(`${href}&page=2`)).toBe(`${href}&page=2`);
    expect(browseReturnHref('/autores/ana?page=3')).toBe('/autores/ana?page=3');
  });
  it('recusa destinos externos ou rotas alheias no botão Voltar', () => {
    for (const href of ['https://external.test', '//external.test/autores', '/\\external.test/autores',
      '/login', '/autores/ana?next=https://external.test', '/series?redirect=abc', ['x'], undefined]) {
      expect(browseReturnHref(href)).toBeNull();
    }
  });
});
