import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchExternalBooks, ExternalSearchError } from '@/lib/openlibrary';

afterEach(() => vi.unstubAllGlobals());

function resposta(docs: unknown[]) {
  return new Response(JSON.stringify({ numFound: docs.length, docs }), { status: 200 });
}

describe('searchExternalBooks', () => {
  it('normaliza um resultado completo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta([{
      title: 'The Shining', author_name: ['Stephen King'], first_publish_year: 1977,
      number_of_pages_median: 447, cover_i: 12345,
      ratings_average: 4.3178, ratings_count: 1847,
    }])));

    const [livro] = await searchExternalBooks('the shining');
    expect(livro.title).toBe('The Shining');
    expect(livro.author).toBe('Stephen King');
    expect(livro.publicationYear).toBe(1977);
    expect(livro.numPages).toBe(447);
    expect(livro.coverId).toBe(12345);
    expect(livro.ratingsAverage).toBeCloseTo(4.3178);
    expect(livro.ratingsCount).toBe(1847);
  });

  it('sem avaliação vira null, NUNCA zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta([{ title: 'Sem Nota' }])));
    const [livro] = await searchExternalBooks('x');
    // zero seria uma nota falsa — pior que ausência de nota
    expect(livro.ratingsAverage).toBeNull();
    expect(livro.ratingsCount).toBeNull();
    expect(livro.coverId).toBeNull();
    expect(livro.author).toBeNull();
  });

  it('ratings_count: 0 explícito da API também vira null (não trava o cadastro)', async () => {
    // A Open Library manda `ratings_average: 0, ratings_count: 0` para livro
    // sem nenhuma avaliação. Sem tratar, escolher esse livro em "Quero ter"
    // mandava `ratingsCount: 0` ao POST /api/books, que responde 400
    // "Número de votos inválido" e o livro não entrava na lista.
    vi.stubGlobal('fetch', vi.fn(async () => resposta([{
      title: 'Sem Votos', ratings_average: 0, ratings_count: 0,
    }])));
    const [livro] = await searchExternalBooks('x');
    expect(livro.ratingsCount).toBeNull();
    expect(livro.ratingsAverage).toBeNull();
  });

  it('devolve no máximo 5 resultados', async () => {
    const docs = Array.from({ length: 12 }, (_, i) => ({ title: `L${i}` }));
    vi.stubGlobal('fetch', vi.fn(async () => resposta(docs)));
    expect(await searchExternalBooks('x')).toHaveLength(5);
  });

  it('lista vazia quando não há resultado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta([])));
    expect(await searchExternalBooks('zzzz')).toEqual([]);
  });

  it('lança ExternalSearchError quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 500 })));
    await expect(searchExternalBooks('x')).rejects.toBeInstanceOf(ExternalSearchError);
  });

  it('lança ExternalSearchError quando a rede falha (timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('aborted'); }));
    await expect(searchExternalBooks('x')).rejects.toBeInstanceOf(ExternalSearchError);
  });
});
