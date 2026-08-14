import { describe, it, expect } from 'vitest';
import { paginaValida } from '@/lib/url-state';

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
