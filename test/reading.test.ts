import { describe, it, expect } from 'vitest';
import {
  paginaDoPercentual, percentualDaPagina, diasParado, DIAS_PARA_PARADO,
} from '@/lib/reading';

describe('paginaDoPercentual', () => {
  it('converte usando o total do livro', () => {
    expect(paginaDoPercentual(58, 310)).toBe(180);
  });

  it('0% é a página 0, não a 1', () => {
    expect(paginaDoPercentual(0, 310)).toBe(0);
  });

  it('100% é a última página', () => {
    expect(paginaDoPercentual(100, 310)).toBe(310);
  });

  it('sem percentual devolve null', () => {
    expect(paginaDoPercentual(null, 310)).toBeNull();
  });

  it('sem total de páginas devolve null', () => {
    expect(paginaDoPercentual(58, null)).toBeNull();
  });
});

describe('percentualDaPagina', () => {
  it('converte e arredonda para inteiro', () => {
    expect(percentualDaPagina(180, 310)).toBe(58);
  });

  it('a última página é 100%', () => {
    expect(percentualDaPagina(310, 310)).toBe(100);
  });

  it('página 0 é 0%', () => {
    expect(percentualDaPagina(0, 310)).toBe(0);
  });

  it('página além do total devolve null — a base não bate', () => {
    // Com fonte ampliada o leitor repagina: "página 700 de 800" num livro
    // cujo metadado diz 310. Converter daria 226%, e clampar para 100%
    // gravaria "terminei" para quem está na metade. Melhor recusar e deixar
    // o dono usar o percentual, que é a fonte da verdade (AD-3).
    expect(percentualDaPagina(999, 310)).toBeNull();
  });

  it('página negativa devolve null', () => {
    expect(percentualDaPagina(-5, 310)).toBeNull();
  });

  it('sem total de páginas devolve null', () => {
    expect(percentualDaPagina(180, null)).toBeNull();
  });
});

describe('diasParado', () => {
  const agora = new Date('2026-08-14T12:00:00Z');

  it('conta os dias inteiros desde a atualização', () => {
    expect(diasParado('2026-07-21T12:00:00Z', agora)).toBe(24);
  });

  it('mesmo dia é zero', () => {
    expect(diasParado('2026-08-14T08:00:00Z', agora)).toBe(0);
  });

  it('nunca atualizado devolve null', () => {
    expect(diasParado(null, agora)).toBeNull();
  });

  it('o limite de "parado" é de duas semanas', () => {
    expect(DIAS_PARA_PARADO).toBe(14);
  });
});
