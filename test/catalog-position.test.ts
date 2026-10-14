import { describe, expect, it } from 'vitest';
import { readCatalogPosition } from '@/lib/catalog-position';

describe('posição do acervo', () => {
  const saved = { query: 'page=3&lng=por', bookId: 19, offset: 120, savedAt: 1000 };
  it('recupera o livro somente na mesma busca e página', () => {
    expect(readCatalogPosition(JSON.stringify(saved), saved.query, 2000)).toEqual(saved);
    expect(readCatalogPosition(JSON.stringify(saved), 'page=1', 2000)).toBeNull();
  });
  it('descarta dados inválidos, futuros e antigos', () => {
    for (const value of [null, 'bad json', '{}', JSON.stringify({ ...saved, bookId: -1 }), JSON.stringify({ ...saved, savedAt: 999999 })]) {
      expect(readCatalogPosition(value, saved.query, 2000)).toBeNull();
    }
    expect(readCatalogPosition(JSON.stringify(saved), saved.query, 1000 + 86400001)).toBeNull();
  });
});
