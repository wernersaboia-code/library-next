import { describe, it, expect } from 'vitest';
import { matchDuplicates, type DuplicateCandidate, type DuplicateQuery } from '@/lib/book-duplicates';

const query: DuplicateQuery = { title: 'Coração, de tinta', authors: ['Cornélia Funke'], isbn13: '9780441013593', sha256: 'a'.repeat(64) };
const book: DuplicateCandidate = { id: 1, title: 'Coracao de Tinta', authors: ['Cornelia Funke'], isbn13: null, sha256: null, hasFile: false, owned: true };

describe('duplicados de importação', () => {
  it('prioriza arquivo idêntico, ISBN e então título/autor', () => {
    const result = matchDuplicates(query, [book,
      { ...book, id: 2, title: 'Outra grafia', isbn13: '0-441-01359-7' },
      { ...book, id: 3, title: 'Arquivo renomeado', sha256: 'A'.repeat(64), hasFile: true },
    ]);
    expect(result.map((item) => [item.id, item.reason])).toEqual([[3, 'arquivo'], [2, 'isbn'], [1, 'titulo-autor']]);
    expect(result[2].hasFile).toBe(false);
  });
  it('não confunde obras homônimas de autores diferentes', () => {
    expect(matchDuplicates(query, [{ ...book, authors: ['Outro autor'] }])).toEqual([]);
  });
  it('apresenta título sem autor como sugestão, sem inventar correspondência', () => {
    expect(matchDuplicates(query, [{ ...book, authors: [] }])[0].reason).toBe('titulo');
    expect(matchDuplicates({ ...query, title: '', authors: [], isbn13: '1111111111111', sha256: null }, [book])).toEqual([]);
  });
});
