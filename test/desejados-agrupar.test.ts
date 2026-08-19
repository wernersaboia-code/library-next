import { describe, it, expect } from 'vitest';
import {
  agruparPorLetra, filtrarLivros, letraInicial, normalizar,
} from '@/app/(main)/desejados/agrupar';

const livro = (
  title: string,
  authors: string[] | null = [],
  original_title: string | null = null
) => ({ title, original_title, authors });

describe('normalizar', () => {
  it('tira acento e caixa', () => {
    expect(normalizar('Ficção Científica')).toBe('ficcao cientifica');
    expect(normalizar('ÁRTICO')).toBe('artico');
  });

  it('não quebra com string vazia', () => {
    expect(normalizar('')).toBe('');
  });
});

describe('filtrarLivros', () => {
  const livros = [
    livro('O Iluminado', ['Stephen King']),
    livro('Ficção Científica', null),
    livro('Duna', ['Frank Herbert']),
    livro('A Revolução dos Bichos', ['George Orwell'], 'Animal Farm'),
  ];

  it('termo vazio devolve tudo, sem copiar em vão', () => {
    expect(filtrarLivros(livros, '')).toEqual(livros);
    expect(filtrarLivros(livros, '   ')).toEqual(livros);
  });

  it('casa trecho do título, ignorando caixa', () => {
    expect(filtrarLivros(livros, 'ILUMIN').map((l) => l.title)).toEqual([
      'O Iluminado',
    ]);
  });

  it('casa o autor, não só o título', () => {
    expect(filtrarLivros(livros, 'herbert').map((l) => l.title)).toEqual(['Duna']);
  });

  it('casa o título original, não só o título traduzido', () => {
    expect(filtrarLivros(livros, 'animal farm').map((l) => l.title)).toEqual([
      'A Revolução dos Bichos',
    ]);
  });

  it('ignora acento nos dois sentidos', () => {
    expect(filtrarLivros(livros, 'ficcao').map((l) => l.title)).toEqual([
      'Ficção Científica',
    ]);
    expect(filtrarLivros(livros, 'ficção').map((l) => l.title)).toEqual([
      'Ficção Científica',
    ]);
  });

  it('não quebra quando o livro não tem autor', () => {
    expect(filtrarLivros(livros, 'cientifica')).toHaveLength(1);
  });

  it('devolve vazio quando nada casa', () => {
    expect(filtrarLivros(livros, 'zzz-inexistente')).toEqual([]);
  });
});

describe('letraInicial', () => {
  it('devolve a letra, sem acento e em maiúscula', () => {
    expect(letraInicial('duna')).toBe('D');
    expect(letraInicial('Ártico')).toBe('A');
  });

  it('agrupa número e símbolo sob #', () => {
    expect(letraInicial('100 anos')).toBe('#');
    expect(letraInicial('...e não sobrou nenhum')).toBe('#');
  });

  it('título vazio cai em # em vez de quebrar', () => {
    expect(letraInicial('')).toBe('#');
  });
});

describe('agruparPorLetra', () => {
  it('agrupa preservando a ordem recebida, sem reordenar', () => {
    // Esta é a ordem que o Postgres devolve (número antes de letra, acento
    // junto da letra-base). A função NÃO pode reordenar: existe uma ordem só.
    const secoes = agruparPorLetra([
      livro('100 anos'), livro('Alien'), livro('Ártico'),
      livro('Echo'), livro('Zumbi'),
    ]);
    expect(secoes.map((s) => s.letra)).toEqual(['#', 'A', 'E', 'Z']);
    expect(secoes[1].livros.map((l) => l.title)).toEqual(['Alien', 'Ártico']);
  });

  it('lista vazia devolve nenhuma seção', () => {
    expect(agruparPorLetra([])).toEqual([]);
  });

  it('uma seção só quando todos começam com a mesma letra', () => {
    const secoes = agruparPorLetra([livro('Alien'), livro('Ártico')]);
    expect(secoes).toHaveLength(1);
    expect(secoes[0].letra).toBe('A');
  });
});
