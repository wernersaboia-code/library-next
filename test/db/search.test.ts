import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

// Antes esta suíte exercitava `title_tsv @@ websearch_to_tsquery(...)` em SQL
// cru — provava o índice GIN, mas não o que o app faz. A busca agora casa
// trecho em título, título original, série, editora e autor, então os testes
// passam a ir por `fetchBooksWithPagination`, que é o caminho real.
beforeAll(async () => {
  ctx = await createTestDb();

  const [u] = await ctx.sql`
    insert into app_users (email) values ('s@x.com') returning id`;
  userId = u.id;

  async function livro(campos: {
    title: string;
    original_title?: string | null;
    series?: string | null;
    publisher?: string | null;
    autor?: string | null;
  }) {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, original_title,
                         series, publisher, owned)
      values (${userId}, ${campos.title}, ${campos.title},
              ${campos.original_title ?? null}, ${campos.series ?? null},
              ${campos.publisher ?? null}, true)
      returning id`;
    if (campos.autor) {
      const id = `a-${campos.autor.replace(/\W/g, '')}`;
      await ctx.sql`
        insert into authors (id, name) values (${id}, ${campos.autor})
        on conflict (id) do nothing`;
      await ctx.sql`
        insert into book_to_author (book_id, author_id) values (${b.id}, ${id})`;
    }
    return b.id as number;
  }

  await livro({ title: 'The Historian', autor: 'Elizabeth Kostova' });
  await livro({ title: 'It - A Coisa', autor: 'Stephen King' });
  await livro({ title: 'O Iluminado', autor: 'Stephen King' });
  // Nome invertido: o acervo real tem autores gravados "Sobrenome, Nome".
  await livro({ title: 'A Torre Negra', autor: 'King, Stephen' });
  await livro({ title: 'Ficção científica brasileira' });
  await livro({ title: 'Duna', original_title: 'Dune' });
  await livro({ title: 'Volume perdido', series: 'Crônicas de Gelo' });
  await livro({ title: 'Sem nome', publisher: 'Companhia das Letras' });
  await livro({ title: "O'Brien e o mistério" });
  await livro({ title: '100% garantido' });

  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  vi.doMock('@/lib/auth-user', () => ({
    getCurrentUserId: async () => userId,
    AuthError: class extends Error {},
  }));
}, 30000);
afterAll(() => ctx.cleanup());

async function busca(search: string) {
  const { fetchBooksWithPagination } = await import('@/lib/db/queries');
  return fetchBooksWithPagination(userId, { search });
}

async function titulos(search: string) {
  return (await busca(search)).map((b) => b.title).sort();
}

describe('busca por autor', () => {
  it('acha todos os livros do autor, não só os que o citam no título', async () => {
    // O bug relatado: "stephen king" trazia 2 de 3 porque só o título era
    // consultado. Inclui o registro invertido "King, Stephen".
    expect(await titulos('stephen king')).toEqual([
      'A Torre Negra',
      'It - A Coisa',
      'O Iluminado',
    ]);
  });

  it('acha por sobrenome isolado', async () => {
    expect((await busca('kostova')).map((b) => b.title)).toEqual([
      'The Historian',
    ]);
  });
});

describe('busca por trecho', () => {
  it('casa pedaço de palavra, sem exigir a palavra inteira', async () => {
    expect((await busca('histor')).map((b) => b.title)).toEqual([
      'The Historian',
    ]);
  });

  it('ignora maiúsculas', async () => {
    expect(await titulos('ILUMINADO')).toEqual(['O Iluminado']);
  });

  it('ignora acento nos dois sentidos', async () => {
    expect(await titulos('ficcao')).toEqual(['Ficção científica brasileira']);
    expect(await titulos('ficção')).toEqual(['Ficção científica brasileira']);
  });
});

describe('busca alcança os demais campos', () => {
  it('acha pelo título original', async () => {
    expect(await titulos('dune')).toEqual(['Duna']);
  });

  it('acha pela série', async () => {
    expect(await titulos('crônicas')).toEqual(['Volume perdido']);
  });

  it('acha pela editora', async () => {
    expect(await titulos('companhia')).toEqual(['Sem nome']);
  });
});

describe('robustez da entrada', () => {
  it('exige que todas as palavras casem, em qualquer campo', async () => {
    expect(await titulos('stephen torre')).toEqual(['A Torre Negra']);
    expect(await titulos('stephen kostova')).toEqual([]);
  });

  it('não quebra com apóstrofo — o bug #10', async () => {
    expect(await titulos("O'Brien")).toEqual(["O'Brien e o mistério"]);
  });

  it('não quebra com operadores de full-text soltos', async () => {
    await expect(busca('& | !')).resolves.toEqual([]);
  });

  it('trata % como texto, não como curinga do LIKE', async () => {
    // Sem escapar, "%" casaria com o acervo inteiro.
    expect(await titulos('100%')).toEqual(['100% garantido']);
    expect(await titulos('%')).toEqual(['100% garantido']);
  });

  it('trata _ como texto, não como curinga de um caractere', async () => {
    expect(await busca('_')).toEqual([]);
  });

  it('busca vazia não filtra nada', async () => {
    expect((await busca('   ')).length).toBeGreaterThan(5);
  });
});

describe('contagem acompanha o filtro de busca', () => {
  it('conta exatamente o que a grade lista, inclusive por autor', async () => {
    // A contagem roda sem os joins de autor: uma referência solta a `authors`
    // derrubaria esta chamada. E precisa BATER com a listagem — enquanto era
    // estimativa do planner, "stephen king" anunciava 415 para 10 livros, e a
    // paginação oferecia páginas vazias.
    const { estimateTotalBooks } = await import('@/lib/db/queries');
    const total = await estimateTotalBooks(userId, { search: 'stephen king' });
    expect(total).toBe((await busca('stephen king')).length);
  });

  it('conta zero quando nada casa', async () => {
    const { estimateTotalBooks } = await import('@/lib/db/queries');
    expect(await estimateTotalBooks(userId, { search: 'zzz-inexistente' })).toBe(0);
  });
});
