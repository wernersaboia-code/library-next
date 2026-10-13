import { describe, it, expect } from 'vitest';
import { aggregate } from '@/lib/metadata/aggregate';
import type { MetadataRecord } from '@/lib/metadata/types';

function registro(
  partial: Partial<MetadataRecord> & { source: MetadataRecord['source'] }
): MetadataRecord {
  return {
    confidence: 0.8,
    title: 'Sem título',
    authors: [],
    publicationYear: null,
    numPages: null,
    publisher: null,
    language: null,
    description: null,
    isbn13: null,
    cover: null,
    ratingsAverage: null,
    ratingsCount: null,
    ...partial,
  };
}

describe('aggregate', () => {
  it('junta registros do mesmo ISBN e escolhe o valor de maior confiança', () => {
    const [livro] = aggregate([
      registro({
        source: 'openlibrary',
        title: 'Duna',
        isbn13: '9780441013593',
        publicationYear: 1965,
        confidence: 0.8,
      }),
      registro({
        source: 'googlebooks',
        title: 'Duna',
        isbn13: '9780441013593',
        numPages: 412,
        confidence: 0.85,
      }),
    ]);

    expect(livro.numPages).toBe(412);
    expect(livro.publicationYear).toBe(1965);
    expect(livro.sources.sort()).toEqual(['googlebooks', 'openlibrary']);
    expect(livro.confidence).toBeGreaterThan(0.85);
    expect(livro.fieldSources.isbn13).toEqual(
      expect.arrayContaining(['openlibrary', 'googlebooks'])
    );
  });

  it('agrupa por título + primeiro autor quando não há ISBN', () => {
    const livros = aggregate([
      registro({ source: 'openlibrary', title: 'O Hobbit', authors: ['Tolkien'] }),
      registro({ source: 'wikidata', title: 'O Hobbit', authors: ['Tolkien'], publicationYear: 1937 }),
    ]);
    expect(livros).toHaveLength(1);
    expect(livros[0].publicationYear).toBe(1937);
  });

  it('mantém registros distintos separados', () => {
    const livros = aggregate([
      registro({ source: 'openlibrary', title: 'A', authors: ['Ana'], isbn13: '1111111111111' }),
      registro({ source: 'googlebooks', title: 'B', authors: ['Bia'], isbn13: '2222222222222' }),
    ]);
    expect(livros).toHaveLength(2);
  });

  it('complementa uma única edição com um registro sem ISBN, em qualquer ordem', () => {
    const a = registro({ source: 'openlibrary', title: 'Duna', authors: ['Frank Herbert'], cover: { provider: 'openlibrary', id: '1' } });
    const b = registro({ source: 'googlebooks', title: 'Duna', authors: ['Frank Herbert'], isbn13: '9780441013593', numPages: 412 });
    for (const records of [[a, b], [b, a]]) {
      const books = aggregate(records);
      expect(books).toHaveLength(1);
      expect(books[0]).toMatchObject({ isbn13: '9780441013593', numPages: 412, cover: a.cover });
    }
  });

  it('não usa um registro sem ISBN para unir edições distintas ou idiomas diferentes', () => {
    const a = registro({ source: 'googlebooks', title: 'Duna', authors: ['Herbert'], isbn13: '9780441013593', language: 'en' });
    const b = registro({ ...a, source: 'wikidata', isbn13: '9780140283297' });
    const c = registro({ source: 'openlibrary', title: 'Duna', authors: ['Herbert'] });
    expect(aggregate([a, b, c])).toHaveLength(3);
    expect(aggregate([a, { ...c, language: 'pt' }])).toHaveLength(2);
  });

  it('atribui o valor vencedor à fonte correta e penaliza conflito', () => {
    const [book] = aggregate([
      registro({ source: 'openlibrary', title: 'Duna', isbn13: '9780441013593', publicationYear: 1965 }),
      registro({ source: 'googlebooks', confidence: .85, title: 'Duna', isbn13: '9780441013593', publicationYear: 2020 }),
    ]);
    expect(book.fieldSources.publicationYear).toEqual(['googlebooks']);
    expect(book.conflicts.publicationYear?.map((v) => v.value)).toEqual([1965, 2020]);
    expect(book.confidence).toBeLessThan(.85);
  });

  it('não une edições sem ISBN incompatíveis por meio de um registro genérico', () => {
    const generic = registro({ source: 'wikidata', title: 'Livro', authors: ['Autor'] });
    const pt = registro({ ...generic, source: 'openlibrary', language: 'pt', numPages: 100 });
    const en = registro({ ...generic, source: 'googlebooks', language: 'en', numPages: 200 });
    for (const list of [[generic, pt, en], [en, generic, pt]]) {
      const result = aggregate(list);
      expect(result).toHaveLength(3);
      expect(result.find((r) => r.language === 'por')?.numPages).toBe(100);
    }
  });
});
