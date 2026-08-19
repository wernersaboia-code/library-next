// lib/db/queries.ts
import { sql, and, or, gte, eq, lte, not, isNull, like } from 'drizzle-orm';
import { books, authors, bookToAuthor, bookCollections } from './schema';
import type { Book } from './schema';
import { SearchParams } from '@/lib/url-state';
import { withUser } from './with-user';

export const ITEMS_PER_PAGE = 28;
export const EMPTY_IMAGE_URL = '';

// — Filtros individuais —

const yearFilter = (yr?: string) => {
    if (yr) {
        const maxYear = Math.max(1950, Math.min(2030, Number(yr)));
        return and(
            gte(books.publication_year, 1950),
            lte(books.publication_year, maxYear)
        );
    }
    return undefined;
};

const ratingFilter = (rtg?: string) => {
    if (rtg) {
        return sql`${books.average_rating} >= ${Number(rtg)}`;
    }
    return undefined;
};

const languageFilter = (lng?: string) => {
    if (!lng) return undefined;
    if (lng === 'en') {
        return sql`${books.language_code} IN ('eng', 'en-US', 'en-GB', 'en')`;
    }
    return eq(books.language_code, lng);
};

const pageFilter = (pgs?: string) => {
    if (pgs) {
        return lte(books.num_pages, Math.min(5000, Number(pgs)));
    }
    return undefined;
};

// `%` e `_` são curingas do LIKE: sem escapar, digitar "%" na busca casaria
// com o acervo inteiro. `\` também precisa escapar, senão vira escape solto.
const escaparLike = (texto: string) =>
    texto.replace(/[\\%_]/g, (c) => `\\${c}`);

const MAX_PALAVRAS_BUSCA = 10;

// A busca full-text antiga ignorava acento de graça (dicionário 'portuguese').
// Trocando-a por ILIKE isso se perderia — "ficcao" deixaria de achar "ficção"
// num acervo em português. `translate` recupera o comportamento sem exigir a
// extensão `unaccent`, que não está instalada e cuja habilitação seria um DDL
// no banco de produção por causa de um ajuste de busca.
const ACENTOS = 'áàâãäéèêëíìîïóòôõöúùûüñçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇ';
const SEM_ACENTOS = 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC';

const semAcento = (valor: unknown) =>
    sql`translate(${valor}, ${ACENTOS}, ${SEM_ACENTOS})`;

/**
 * Busca por trecho em título, título original, série, editora e autor.
 *
 * Antes era full-text (`title_tsv @@ websearch_to_tsquery('portuguese', …)`)
 * só no título, o que falhava de três formas: não alcançava autor nenhum
 * (autores moram em `authors`, via `book_to_author`), exigia palavra inteira
 * — "histor" não achava "The Historian" — e passava títulos em inglês pelo
 * dicionário português, que os radicaliza errado.
 *
 * Cada palavra digitada precisa aparecer em algum dos campos, o que deixa
 * "stephen king" achar o autor mesmo com o nome gravado como "King, Stephen".
 * O índice GIN de title_tsv deixa de ser usado; com ~1.6k livros por usuário
 * a varredura é irrelevante, e a previsibilidade vale mais que o índice.
 */
const searchFilter = (q?: string) => {
    const termo = q?.trim();
    if (!termo) return undefined;

    const palavras = termo
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, MAX_PALAVRAS_BUSCA);
    if (palavras.length === 0) return undefined;

    return and(
        ...palavras.map((palavra) => {
            const alvo = `%${escaparLike(palavra)}%`;
            const casa = (coluna: unknown) =>
                sql`${semAcento(coluna)} ILIKE ${semAcento(alvo)}`;
            return or(
                casa(books.title),
                casa(books.original_title),
                casa(books.series),
                casa(books.publisher),
                // EXISTS, não join: `estimateTotalBooks` roda um
                // `SELECT id FROM books` sem os joins de autor, e uma
                // referência solta a `authors` ali quebraria a contagem.
                sql`EXISTS (
                    SELECT 1 FROM book_to_author ba
                    JOIN authors a ON a.id = ba.author_id
                    WHERE ba.book_id = ${books.id}
                      AND ${semAcento(sql`a.name`)} ILIKE ${semAcento(alvo)}
                )`
            );
        })
    );
};

// Existia para esconder livros sem capa importados do Calibre. Livros
// importados do Drive não têm capa até o upload assíncrono terminar — com o
// filtro ligado por padrão eles ficariam invisíveis nesse meio-tempo. Por
// isso o default é NÃO filtrar; passe `true` para restaurar o comportamento
// antigo explicitamente.
const imageFilter = (enabled?: boolean) => {
    if (!enabled) return undefined;
    return and(
        not(isNull(books.image_url)),
        sql`${books.image_url} != ${EMPTY_IMAGE_URL}`
    );
};

const isbnFilter = (isbn?: string) => {
    if (!isbn) return undefined;
    const isbnArray = isbn.split(',').map((id) => id.trim());
    return sql`books.isbn IN (${sql.join(
        isbnArray.map((id) => sql`${id}`),
        sql`, `
    )})`;
};

const genreFilter = (genre?: string) => {
    if (!genre) return undefined;
    return eq(books.genre, genre);
};

const statusFilter = (status?: string) => {
    if (!status) return undefined;
    return eq(books.read_status, status);
};

const seriesFilter = (series?: string) => {
    if (!series) return undefined;
    if (series === 'sim') return not(isNull(books.series));
    if (series === 'não') return isNull(books.series);
    return undefined;
};

const publisherFilter = (pub?: string) => {
    if (!pub) return undefined;
    return like(books.publisher, `%${pub}%`);
};

// Default do catálogo é "possuídos" — livros desejados/não-possuídos não
// devem sujar a listagem por padrão. Só 'todos' remove o filtro; qualquer
// outro valor não reconhecido cai no default (possuídos).
const posseFilter = (posse?: string) => {
    if (posse === 'todos') return undefined;
    if (posse === 'nao-possuidos') return eq(books.owned, false);
    return eq(books.owned, true);
};

// Filtra por pertencer a uma biblioteca. `exists` em vez de join: um join
// multiplicaria linhas se o livro estivesse em várias bibliotecas, e a
// listagem passaria a repetir capas.
const bibFilter = (bib?: string) => {
    if (!bib) return undefined;
    const id = Number(bib);
    // Id inválido vira "sem filtro": um link torto não deve quebrar a página.
    if (!Number.isInteger(id) || id <= 0) return undefined;
    return sql`exists (
        select 1 from ${bookCollections} bc
        where bc.book_id = ${books.id} and bc.collection_id = ${id}
    )`;
};

// — Helpers —

function buildFilters(searchParams: SearchParams, requireImage = false) {
    return [
        imageFilter(requireImage),
        yearFilter(searchParams.yr),
        ratingFilter(searchParams.rtg),
        languageFilter(searchParams.lng),
        pageFilter(searchParams.pgs),
        searchFilter(searchParams.search),
        isbnFilter(searchParams.isbn),
        genreFilter(searchParams.genre),
        statusFilter(searchParams.status),
        seriesFilter(searchParams.series),
        publisherFilter(searchParams.pub),
        posseFilter(searchParams.posse),
        bibFilter(searchParams.bib),
    ].filter(Boolean);
}

// — Queries públicas —

// A grade mostra a legenda (título/autor) sob a capa; `authors` vem do
// array_agg abaixo, não é coluna de `books`.
export type GridBook = Book & { authors: string[] };

export async function fetchBooksWithPagination(
    userId: string,
    searchParams: SearchParams
): Promise<GridBook[]> {
    const requestedPage = Math.max(1, Number(searchParams?.page) || 1);
    const filters = buildFilters(searchParams);
    const whereClause = filters.length > 0 ? and(...filters) : undefined;
    const offset = (requestedPage - 1) * ITEMS_PER_PAGE;

    return withUser(userId, (tx) =>
        tx
            .select({
                id: books.id,
                title: books.title,
                image_url: books.image_url,
                thumbhash: books.thumbhash,
                read_status: books.read_status,
                my_rating: books.my_rating,
                owned: books.owned,
                next_up: books.next_up,
                favorite: books.favorite,
                authors: sql<string[]>`array_remove(array_agg(${authors.name}), NULL)`,
            })
            .from(books)
            .leftJoin(bookToAuthor, eq(books.id, bookToAuthor.bookId))
            .leftJoin(authors, eq(bookToAuthor.authorId, authors.id))
            .where(whereClause)
            .groupBy(books.id)
            .orderBy(books.id)
            .limit(ITEMS_PER_PAGE)
            .offset(offset)
    );
}

/**
 * Total de resultados do filtro atual.
 *
 * Antes lia `Plan Rows` de um EXPLAIN — estimativa do planner, escolhida para
 * evitar um COUNT caro. Medido contra o acervo real, a estimativa erra por uma
 * ordem de grandeza quando a busca casa texto: "stephen king" tem 10 livros e
 * o planner cravava 415. Como a paginação sai daqui, o acervo anunciava 15
 * páginas das quais 14 vinham vazias.
 *
 * COUNT exato: com ~1,6 mil livros por usuário a diferença é imperceptível, e
 * um número redondo e errado é pior que alguns milissegundos.
 */
export async function estimateTotalBooks(
    userId: string,
    searchParams: SearchParams
) {
    const filters = buildFilters(searchParams);
    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    return withUser(userId, async (tx) => {
        const [linha] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(books)
            .where(whereClause);
        return linha?.total ?? 0;
    });
}


export async function fetchBookById(userId: string, id: string) {
    const result = await withUser(userId, (tx) =>
        tx
            .select({
                id: books.id,
                isbn: books.isbn,
                isbn13: books.isbn13,
                title: books.title,
                original_title: books.original_title,
                publication_year: books.publication_year,
                publisher: books.publisher,
                series: books.series,
                series_index: books.series_index,
                image_url: books.image_url,
                description: books.description,
                num_pages: books.num_pages,
                language_code: books.language_code,
                text_reviews_count: books.text_reviews_count,
                ratings_count: books.ratings_count,
                average_rating: books.average_rating,
                genre: books.genre,
                read_status: books.read_status,
                my_rating: books.my_rating,
                owned: books.owned,
                next_up: books.next_up,
                favorite: books.favorite,
                progress_percent: books.progress_percent,
                progress_updated_at: books.progress_updated_at,
                dnf_reason: books.dnf_reason,
                date_started: books.date_started,
                date_finished: books.date_finished,
                createdAt: books.createdAt,
                authors: sql<string[]>`array_agg(${authors.name})`,
                thumbhash: books.thumbhash,
                // Subconsulta em vez de mais um leftJoin: a query já agrega
                // autores com array_agg, e um segundo join multiplicaria as
                // linhas, duplicando os autores de quem está em duas
                // bibliotecas.
                collections: sql<{ id: number; name: string }[]>`coalesce((
                    select json_agg(json_build_object('id', c.id, 'name', c.name)
                                    order by c.name)
                    from book_collections bc
                    join collections c on c.id = bc.collection_id
                    where bc.book_id = ${books.id}
                ), '[]'::json)`,
            })
            .from(books)
            .leftJoin(bookToAuthor, eq(books.id, bookToAuthor.bookId))
            .leftJoin(authors, eq(bookToAuthor.authorId, authors.id))
            .where(eq(books.id, parseInt(id)))
            .groupBy(books.id)
            .limit(1)
    );

    return result[0];
}

// — Queries auxiliares para popular filtros dinamicamente —

export async function fetchDistinctGenres(userId: string): Promise<string[]> {
    const result = await withUser(userId, (tx) =>
        tx
            .selectDistinct({ genre: books.genre })
            .from(books)
            .where(not(isNull(books.genre)))
            .orderBy(books.genre)
    );

    return result.map((r) => r.genre).filter(Boolean) as string[];
}

// — Lista de desejados —

// Só livros manuais ainda não possuídos. Livros do Calibre que ficaram
// owned=false (apagados de lá) NÃO entram aqui — "quero ter" e "tive e não
// tenho mais" são coisas diferentes; o segundo caso é alcançável pelo
// filtro de posse do catálogo (posse=nao-possuidos).
export async function fetchWishlist(userId: string) {
  return withUser(userId, (tx) =>
    tx
      .select({
        id: books.id,
        title: books.title,
        publication_year: books.publication_year,
        num_pages: books.num_pages,
        createdAt: books.createdAt,
        image_url: books.image_url,
        thumbhash: books.thumbhash,
        average_rating: books.average_rating,
        ratings_count: books.ratings_count,
        // array_remove tira o NULL que o leftJoin produz quando o livro não
        // tem autor cadastrado — sem isso o array viraria [null] em vez de [].
        authors: sql<string[]>`array_remove(array_agg(${authors.name}), NULL)`,
      })
      .from(books)
      .leftJoin(bookToAuthor, eq(books.id, bookToAuthor.bookId))
      .leftJoin(authors, eq(bookToAuthor.authorId, authors.id))
      .where(and(eq(books.source, 'manual'), eq(books.owned, false)))
      .groupBy(books.id)
      // Alfabética, não cronológica: a lista é para procurar um título
      // específico, não para ver o que entrou por último. A ordenação fica
      // só aqui — o cliente agrupa por letra a partir desta ordem, sem
      // reordenar, para não existirem duas ordens que possam divergir.
      .orderBy(books.title)
  );
}

// — Leitura em andamento —

export interface ReadingNowBook {
    id: number;
    title: string;
    image_url: string | null;
    thumbhash: string | null;
    progress_percent: number | null;
    progress_updated_at: Date | null;
    num_pages: number | null;
}

export const LIVROS_NA_FAIXA = 6;

/**
 * Livros em leitura, do mais recentemente atualizado ao mais antigo.
 * Limitado (AD-5): acima disso a faixa empurraria o catálogo — que é o
 * motivo da página existir — para fora da tela.
 */
export async function fetchReadingNow(
    userId: string
): Promise<ReadingNowBook[]> {
    return withUser(userId, (tx) =>
        tx
            .select({
                id: books.id,
                title: books.title,
                image_url: books.image_url,
                thumbhash: books.thumbhash,
                progress_percent: books.progress_percent,
                progress_updated_at: books.progress_updated_at,
                num_pages: books.num_pages,
            })
            .from(books)
            .where(eq(books.read_status, 'lendo'))
            // nulls last: livro marcado como lendo sem progresso registrado
            // vai para o fim, não para o topo.
            .orderBy(sql`${books.progress_updated_at} desc nulls last`)
            .limit(LIVROS_NA_FAIXA)
    );
}

export async function fetchDistinctPublishers(
    userId: string
): Promise<string[]> {
    const result = await withUser(userId, (tx) =>
        tx
            .selectDistinct({ publisher: books.publisher })
            .from(books)
            .where(not(isNull(books.publisher)))
            .orderBy(books.publisher)
    );

    return result.map((r) => r.publisher).filter(Boolean) as string[];
}

// — Estantes de fila e de favoritos —

export interface LivroDaEstante {
    id: number;
    title: string;
    image_url: string | null;
    thumbhash: string | null;
    read_status: string;
    my_rating: number | null;
    owned: boolean;
    authors: string[];
}

const colunasDaEstante = {
    id: books.id,
    title: books.title,
    image_url: books.image_url,
    thumbhash: books.thumbhash,
    read_status: books.read_status,
    my_rating: books.my_rating,
    owned: books.owned,
    authors: sql<string[]>`array_remove(array_agg(${authors.name}), NULL)`,
};

/** A fila de leitura: o que o dono decidiu ler antes dos outros. */
export async function fetchNextUp(userId: string): Promise<LivroDaEstante[]> {
    return withUser(userId, (tx) =>
        tx
            .select(colunasDaEstante)
            .from(books)
            .leftJoin(bookToAuthor, eq(books.id, bookToAuthor.bookId))
            .leftJoin(authors, eq(bookToAuthor.authorId, authors.id))
            .where(eq(books.next_up, true))
            .groupBy(books.id)
            .orderBy(books.title)
    );
}

/** A lista curta: lidos que superaram as expectativas. */
export async function fetchFavorites(userId: string): Promise<LivroDaEstante[]> {
    return withUser(userId, (tx) =>
        tx
            .select(colunasDaEstante)
            .from(books)
            .leftJoin(bookToAuthor, eq(books.id, bookToAuthor.bookId))
            .leftJoin(authors, eq(bookToAuthor.authorId, authors.id))
            .where(eq(books.favorite, true))
            .groupBy(books.id)
            .orderBy(books.title)
    );
}

/**
 * O histórico de leitura: o que já foi terminado.
 *
 * Ordem cronológica inversa — o que se acabou de ler vem primeiro. `nulls
 * last` é o ponto todo: por padrão o Postgres põe NULL no topo de um DESC, e
 * como boa parte do acervo foi marcada como lida sem registrar a data, o topo
 * da página seria justamente o que não tem informação nenhuma. Sem data,
 * desempata por título.
 */
export async function fetchLidos(userId: string): Promise<LivroDaEstante[]> {
    return withUser(userId, (tx) =>
        tx
            .select(colunasDaEstante)
            .from(books)
            .leftJoin(bookToAuthor, eq(books.id, bookToAuthor.bookId))
            .leftJoin(authors, eq(bookToAuthor.authorId, authors.id))
            .where(eq(books.read_status, 'lido'))
            .groupBy(books.id)
            .orderBy(sql`${books.date_finished} desc nulls last`, books.title)
    );
}

/** O que foi largado no meio. Ordem alfabética, como as demais estantes. */
export async function fetchAbandonados(
    userId: string
): Promise<LivroDaEstante[]> {
    return withUser(userId, (tx) =>
        tx
            .select(colunasDaEstante)
            .from(books)
            .leftJoin(bookToAuthor, eq(books.id, bookToAuthor.bookId))
            .leftJoin(authors, eq(bookToAuthor.authorId, authors.id))
            .where(eq(books.read_status, 'abandonado'))
            .groupBy(books.id)
            .orderBy(books.title)
    );
}

// — Painel (estatísticas) —

export interface PeriodoStats {
    livros: number;
    paginas: number;
}

export interface ReadingStats {
    totalBooks: number;
    lendo: number;
    lidos: number;
    abandonados: number;
    paginasLidas: number;
    naoLidos: number;
    lidosSemData: number;
    mes: PeriodoStats;
    ano: PeriodoStats;
    porAno: Record<string, number>;
}

/**
 * Estatísticas do painel. AD-7 da spec do tracker: leitura ignora posse
 * (`owned`) — apagar um livro do Calibre não apaga o histórico de que ele
 * foi lido. Só "acervo" (totalBooks/naoLidos) é restrito a possuídos.
 *
 * Três consultas em vez das nove sequenciais que a rota fazia: os totais
 * saem de um único `count(*) FILTER`, que o Postgres avalia numa passada
 * pela tabela.
 */
export async function fetchReadingStats(userId: string): Promise<ReadingStats> {
    return withUser(userId, async (tx) => {
        // FILTER condensa os antigos count(*) avulsos num único scan.
        const aggs = await tx.execute(sql`
            SELECT
              count(*) FILTER (WHERE ${books.owned})::int AS total_books,
              count(*) FILTER (WHERE ${books.read_status} = 'lendo')::int AS lendo,
              count(*) FILTER (WHERE ${books.read_status} = 'lido')::int AS lidos,
              count(*) FILTER (WHERE ${books.read_status} = 'abandonado')::int AS abandonados,
              count(*) FILTER (WHERE ${books.owned}
                               AND ${books.read_status} = 'não lido')::int AS nao_lidos,
              count(*) FILTER (WHERE ${books.read_status} = 'lido'
                               AND ${books.date_finished} IS NULL)::int AS lidos_sem_data,
              coalesce(sum(${books.num_pages})
                       FILTER (WHERE ${books.read_status} = 'lido'), 0)::int AS paginas_lidas
            FROM ${books}
        `) as unknown as [Contagens];

        // Um período é definido pela data de conclusão. `date_trunc` compara
        // no fuso do banco; livro terminado em 31/12 fica no ano dele.
        const periodos = await tx.execute(sql`
            SELECT
              count(*) FILTER (WHERE date_trunc('month', ${books.date_finished})
                               = date_trunc('month', current_date))::int AS mes_livros,
              coalesce(sum(${books.num_pages})
                       FILTER (WHERE date_trunc('month', ${books.date_finished})
                               = date_trunc('month', current_date)), 0)::int AS mes_paginas,
              count(*) FILTER (WHERE date_trunc('year', ${books.date_finished})
                               = date_trunc('year', current_date))::int AS ano_livros,
              coalesce(sum(${books.num_pages})
                       FILTER (WHERE date_trunc('year', ${books.date_finished})
                               = date_trunc('year', current_date)), 0)::int AS ano_paginas
            FROM ${books}
            WHERE ${books.read_status} = 'lido'
        `) as unknown as [Periodos];

        const porAnoRows = await tx
            .select({
                ano: sql<string>`extract(year from ${books.date_finished})::text`,
                n: sql<number>`count(*)`,
            })
            .from(books)
            .where(sql`${books.date_finished} is not null`)
            .groupBy(sql`extract(year from ${books.date_finished})`);

        return {
            totalBooks: aggs[0].total_books,
            lendo: aggs[0].lendo,
            lidos: aggs[0].lidos,
            abandonados: aggs[0].abandonados,
            paginasLidas: aggs[0].paginas_lidas,
            naoLidos: aggs[0].nao_lidos,
            lidosSemData: aggs[0].lidos_sem_data,
            mes: { livros: periodos[0].mes_livros, paginas: periodos[0].mes_paginas },
            ano: { livros: periodos[0].ano_livros, paginas: periodos[0].ano_paginas },
            porAno: Object.fromEntries(porAnoRows.map((r) => [r.ano, Number(r.n)])),
        };
    });
}

interface Contagens {
    total_books: number;
    lendo: number;
    lidos: number;
    abandonados: number;
    nao_lidos: number;
    lidos_sem_data: number;
    paginas_lidas: number;
}

interface Periodos {
    mes_livros: number;
    mes_paginas: number;
    ano_livros: number;
    ano_paginas: number;
}