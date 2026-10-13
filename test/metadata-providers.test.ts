import { afterEach, describe, expect, it, vi } from 'vitest';
import { openLibraryProvider } from '@/lib/metadata/providers/openlibrary';
import { googleBooksProvider } from '@/lib/metadata/providers/googlebooks';

afterEach(() => vi.unstubAllGlobals());

describe('fontes de metadados', () => {
  it('consulta a edição exata por ISBN e inclui todos os autores da Open Library', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/isbn/')) return Response.json({ title: 'Duna', publishers: ['Editora'], publish_date: '2020',
        number_of_pages: 412, languages: [{ key: '/languages/por' }], description: { value: 'Sinopse' }, covers: [-1, 123],
        authors: [{ key: '/authors/OL1A' }, { key: '/authors/OL2A' }, { key: 'https://invalid.test' }] });
      return Response.json({ name: url.includes('OL1A') ? 'Ana' : 'João' });
    });
    vi.stubGlobal('fetch', fetch);
    const [book] = await openLibraryProvider.search('0-441-01359-7');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://openlibrary.org/isbn/9780441013593.json',
      'https://openlibrary.org/authors/OL1A.json', 'https://openlibrary.org/authors/OL2A.json']);
    expect(book).toMatchObject({ authors: ['Ana', 'João'], isbn13: '9780441013593', language: 'por',
      publicationYear: 2020, numPages: 412, description: 'Sinopse', cover: { provider: 'openlibrary', id: '123' } });
  });
  it('não inventa ISBN de uma edição durante a busca geral por obra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ docs: [{ title: 'Duna', author_name: ['Ana', 'João'], isbn: ['9780441013593'] }] })));
    const [book] = await openLibraryProvider.search('Duna');
    expect(book.isbn13).toBeNull(); expect(book.authors).toEqual(['Ana', 'João']);
  });
  it('usa a consulta de ISBN do Google e descarta identificadores inválidos', async () => {
    const fetch = vi.fn(async (_url: string) => Response.json({ items: [{ id: 'id', volumeInfo: { title: 'Livro', industryIdentifiers: [{ type: 'ISBN_13', identifier: '1111111111111' }] } }] }));
    vi.stubGlobal('fetch', fetch);
    const [book] = await googleBooksProvider.search('0-441-01359-7');
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get('q')).toBe('isbn:9780441013593');
    expect(book.isbn13).toBeNull();
  });
});
