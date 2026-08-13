import { describe, it, expect } from 'vitest';
import { decideSync, metadataValues, type CalibreBookInput } from '@/lib/db/calibre-sync';

function input(over: Partial<CalibreBookInput> = {}): CalibreBookInput {
  return {
    uuid: 'u-1', lastModified: '2026-01-01 10:00:00+00:00',
    title: 'Livro', authors: ['Autor'], publicationYear: 2020,
    publisher: 'Ed', series: null, languageCode: 'pt', description: 'd',
    genre: 'Ficção', numPages: 300, averageRating: '4.00',
    isbn: null, isbn13: null, hasCover: true, path: 'Autor/Livro (1)', ...over,
  };
}

describe('decideSync', () => {
  it('insere quando o livro não existe', () => {
    expect(decideSync(input(), undefined)).toEqual({ kind: 'insert' });
  });

  it('pula quando last_modified é igual', () => {
    expect(decideSync(input(), { id: 7, calibreModified: '2026-01-01 10:00:00+00:00' }))
      .toEqual({ kind: 'skip', bookId: 7 });
  });

  it('atualiza quando last_modified mudou', () => {
    expect(decideSync(input(), { id: 7, calibreModified: '2025-12-01 09:00:00+00:00' }))
      .toEqual({ kind: 'update', bookId: 7 });
  });

  it('atualiza quando o existente não tem calibre_modified', () => {
    expect(decideSync(input(), { id: 7, calibreModified: null }))
      .toEqual({ kind: 'update', bookId: 7 });
  });
});

describe('metadataValues', () => {
  it('inclui os campos de catálogo', () => {
    const v = metadataValues(input());
    expect(v.title).toBe('Livro');
    expect(v.title_source).toBe('Livro');
    expect(v.genre).toBe('Ficção');
    expect(v.num_pages).toBe(300);
    expect(v.calibre_modified).toBe('2026-01-01 10:00:00+00:00');
  });

  it('NUNCA inclui campos de tracking — a regra mestra da spec', () => {
    const v = metadataValues(input());
    for (const proibido of [
      'read_status', 'my_rating', 'date_started', 'date_finished', 'owned', 'source',
    ]) {
      expect(v).not.toHaveProperty(proibido);
    }
  });
});
