import { describe, expect, it } from 'vitest';
import { savedSearchQuery, savedSearchName } from '@/lib/saved-searches';

describe('estantes dinâmicas', () => {
  it('guarda filtros e descarta página e parâmetros estranhos', () => {
    expect(savedSearchQuery('page=8&lng=por&status=n%C3%A3o+lido&from=https://evil.test&unknown=x'))
      .toBe('lng=por&status=n%C3%A3o+lido');
  });
  it('rejeita busca vazia e números que quebrariam a consulta', () => {
    for (const query of ['', 'page=3', 'pgs=NaN', 'yr=Infinity', 'bib=-1', 'status=errado', 'posse=não possuídos']) expect(savedSearchQuery(query)).toBeNull();
  });
  it('limita e normaliza o nome', () => {
    expect(savedSearchName('  Curtos  ')).toBe('Curtos');
    for (const name of ['', ' ', null, 1, 'a'.repeat(81)]) expect(savedSearchName(name)).toBeNull();
  });
});
