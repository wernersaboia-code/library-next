import { describe, it, expect } from 'vitest';
import { proximaNota, preenchimento, formatarNota } from '@/lib/estrelas';

describe('proximaNota (AD-2)', () => {
  it('primeiro toque grava a estrela cheia', () => {
    expect(proximaNota(null, 4)).toBe(4);
  });

  it('tocar de novo na mesma estrela tira meia', () => {
    expect(proximaNota(4, 4)).toBe(3.5);
  });

  it('um terceiro toque limpa a nota', () => {
    expect(proximaNota(3.5, 4)).toBeNull();
  });

  it('tocar em outra estrela grava aquela, cheia', () => {
    expect(proximaNota(4, 2)).toBe(2);
    expect(proximaNota(3.5, 5)).toBe(5);
  });

  it('funciona na primeira estrela, que tem meia como mínimo', () => {
    expect(proximaNota(null, 1)).toBe(1);
    expect(proximaNota(1, 1)).toBe(0.5);
    expect(proximaNota(0.5, 1)).toBeNull();
  });
});

describe('preenchimento', () => {
  it('pinta cheias, meia e vazias a partir da nota', () => {
    // 3,5 = três cheias, a quarta pela metade, a quinta vazia.
    expect([1, 2, 3, 4, 5].map((n) => preenchimento(3.5, n)))
      .toEqual([1, 1, 1, 0.5, 0]);
  });

  it('sem nota não pinta nada', () => {
    expect([1, 2, 3, 4, 5].map((n) => preenchimento(null, n)))
      .toEqual([0, 0, 0, 0, 0]);
  });

  it('meia estrela só pinta a primeira pela metade', () => {
    expect([1, 2].map((n) => preenchimento(0.5, n))).toEqual([0.5, 0]);
  });
});

describe('formatarNota', () => {
  it('usa vírgula, como o português escreve', () => {
    expect(formatarNota(3.5)).toBe('3,5');
    expect(formatarNota(4)).toBe('4');
  });
});
