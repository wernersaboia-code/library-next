import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { BookPagination } from '@/components/book-pagination';

function render(page: number, totalPages = 3) {
  return renderToStaticMarkup(React.createElement(BookPagination, {
    currentPage: page,
    totalPages,
    totalResults: 84,
    searchParams: { search: 'ficção & história', bib: '8', page: String(page), status: undefined },
  }));
}

function destinos(html: string) {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) =>
    new URL(match[1].replaceAll('&amp;', '&'), 'https://catalog.test')
  );
}

describe('paginação nativa, sem provider do router cliente', () => {
  it('renderiza destinos reais para os dois sentidos e preserva os filtros', () => {
    const links = destinos(render(2));
    expect(links.map((url) => url.searchParams.get('page'))).toEqual(['1', '3']);
    for (const url of links) {
      expect(url.searchParams.get('search')).toBe('ficção & história');
      expect(url.searchParams.get('bib')).toBe('8');
      expect(url.searchParams.has('status')).toBe(false);
    }
  });

  it('mantém o salto como formulário GET com um único campo de página', () => {
    const html = render(2);
    expect(html).toMatch(/<form[^>]*action="\/"[^>]*method="get"/);
    expect([...html.matchAll(/name="page"/g)]).toHaveLength(1);
    expect(html).toContain('name="search"');
    expect(html).toContain('name="bib"');
    expect(html).not.toContain('name="status"');
  });

  it('não cria links para fora dos limites', () => {
    expect(destinos(render(1)).map((url) => url.searchParams.get('page'))).toEqual(['2']);
    expect(destinos(render(3)).map((url) => url.searchParams.get('page'))).toEqual(['2']);
    expect(render(1)).toContain('aria-disabled="true"');
  });

  it('omite o controle quando não há outra página', () => {
    expect(render(1, 1)).toBe('');
    expect(render(1, 0)).toBe('');
  });
});
