import { describe, it, expect } from 'vitest';
import { direcaoDaVirada, GESTO_VIRADA_PX, type PontoDoToque } from '@/lib/gesto-pagina';

const t0 = 1_000_000;
const ponto = (x: number, y: number, ms = 0): PontoDoToque => ({ x, y, ms: t0 + ms });

describe('direcaoDaVirada', () => {
  it('dedo para a esquerda avança (leitura da esquerda para a direita)', () => {
    expect(direcaoDaVirada(ponto(300, 400), ponto(200, 405, 200))).toBe('proxima');
  });

  it('dedo para a direita volta', () => {
    expect(direcaoDaVirada(ponto(150, 400), ponto(250, 398, 200))).toBe('anterior');
  });

  it('arrasto curto não vira a página', () => {
    expect(direcaoDaVirada(ponto(300, 400), ponto(300 - GESTO_VIRADA_PX + 1, 400, 150))).toBe(null);
  });

  it('exatamente no limite já vale', () => {
    expect(direcaoDaVirada(ponto(300, 400), ponto(300 - GESTO_VIRADA_PX, 400, 150))).toBe('proxima');
  });

  it('arrasto mais vertical que horizontal é rolagem, não virada', () => {
    expect(direcaoDaVirada(ponto(300, 200), ponto(240, 400, 200))).toBe(null);
  });

  it('arrasto lento é seleção de texto, não virada', () => {
    expect(direcaoDaVirada(ponto(300, 400), ponto(200, 400, 900))).toBe(null);
  });

  it('com texto selecionado não vira, mesmo no arrasto rápido', () => {
    expect(
      direcaoDaVirada(ponto(300, 400), ponto(200, 400, 150), { temSelecao: true })
    ).toBe(null);
  });

  it('para a direita a partir da borda esquerda é o "voltar" do navegador', () => {
    expect(direcaoDaVirada(ponto(10, 400), ponto(120, 400, 150))).toBe(null);
  });

  it('fora da faixa da borda, para a direita volta normalmente', () => {
    expect(direcaoDaVirada(ponto(40, 400), ponto(190, 400, 150))).toBe('anterior');
  });

  it('para a esquerda a partir da borda esquerda é virada normal', () => {
    // o guarda de borda só protege o arrasto PARA A DIREITA
    expect(direcaoDaVirada(ponto(10, 400), ponto(-140, 400, 150))).toBe('proxima');
  });

  it('página ampliada com a pinça: arrasto horizontal é rolagem', () => {
    expect(
      direcaoDaVirada(ponto(300, 400), ponto(200, 400, 150), { ampliado: true })
    ).toBe(null);
  });

  it('sem o toque inicial (gesto fora da área de leitura) não vira', () => {
    expect(direcaoDaVirada(null, ponto(200, 400, 150))).toBe(null);
  });
});
