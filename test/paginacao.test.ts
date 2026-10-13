import { describe, it, expect } from 'vitest';
import { hrefDaPagina, paginaValida } from '@/lib/url-state';

describe('paginaValida (AD-8)', () => {
  it('devolve a página pedida quando ela existe', () => {
    expect(paginaValida('17', 42)).toBe(17);
  });

  it('limita ao total em vez de dar erro', () => {
    expect(paginaValida('99', 42)).toBe(42);
  });

  it('limita a 1 por baixo', () => {
    expect(paginaValida('0', 42)).toBe(1);
    expect(paginaValida('-3', 42)).toBe(1);
  });

  it('devolve 1 para lixo, que a barra de endereços permite digitar', () => {
    expect(paginaValida('abc', 42)).toBe(1);
    expect(paginaValida(undefined, 42)).toBe(1);
    expect(paginaValida('2.5', 42)).toBe(1);
  });

  it('devolve 1 quando não há nenhuma página', () => {
    expect(paginaValida('3', 0)).toBe(1);
  });
});

describe('destino da paginação', () => {
  it('substitui a página uma única vez, preservando busca e filtros', () => {
    const url = new URL(hrefDaPagina({ page: '2', search: 'ficção', bib: '8', status: 'lido', posse: 'todos' }, 3), 'https://catalog.test');
    expect(url.pathname).toBe('/');
    expect(url.searchParams.getAll('page')).toEqual(['3']);
    expect(url.searchParams.get('search')).toBe('ficção');
    expect(url.searchParams.get('bib')).toBe('8');
    expect(url.searchParams.get('status')).toBe('lido');
    expect(url.searchParams.get('posse')).toBe('todos');
  });

  it('preserva caracteres especiais sem transformar texto em parâmetros', () => {
    const texto = 'A&B / 100% + C';
    const url = new URL(hrefDaPagina({ search: texto, pub: texto }, 2), 'https://catalog.test');
    expect(url.searchParams.get('search')).toBe(texto);
    expect(url.searchParams.get('pub')).toBe(texto);
    expect([...url.searchParams.keys()]).toEqual(['search', 'pub', 'page']);
  });

  it('omite filtros indefinidos em vez de enviar a palavra undefined', () => {
    expect(hrefDaPagina({ search: undefined, yr: undefined }, 2)).toBe('/?page=2');
  });

  it('não altera os filtros fornecidos', () => {
    const params = { page: '1', search: 'livro' };
    hrefDaPagina(params, 2);
    expect(params).toEqual({ page: '1', search: 'livro' });
  });

  it('não gera páginas negativas, fracionadas ou não finitas', () => {
    for (const pagina of [-1, 0, 2.5, Infinity, NaN]) {
      expect(hrefDaPagina({}, pagina)).toBe('/?page=1');
    }
  });
});
