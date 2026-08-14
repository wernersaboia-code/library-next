// lib/db/queries.ts
import { sql, and, gte, eq, lte, not, isNull, like } from 'drizzle-orm';
import { books, authors, bookToAuthor } from './schema';
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

const searchFilter = (q?: string) => {
    const termo = q?.trim();
    if (!termo) return undefined;
    // websearch_to_tsquery nunca lança: trata aspas, apóstrofo e operadores
    // soltos (& | !) sem derrubar a query — ao contrário de to_tsquery.
    // 'portuguese' casa com o dicionário da coluna gerada title_tsv, o que
    // permite o planner usar o índice GIN (idx_books_title_tsv).
    return sql`${books.title_tsv} @@ websearch_to_tsquery('portuguese', ${termo})`;
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
    ].filter(Boolean);
}

// — Queries públicas —

export async function fetchBooksWithPagination(
    userId: string,
    searchParams: SearchParams
) {
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
            })
            .from(books)
            .where(whereClause)
            .orderBy(books.id)
            .limit(ITEMS_PER_PAGE)
            .offset(offset)
    );
}

export async function estimateTotalBooks(
    userId: string,
    searchParams: SearchParams
) {
    const filters = buildFilters(searchParams);
    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    return withUser(userId, async (tx) => {
        const explainResult = await tx.execute(sql`
      EXPLAIN (FORMAT JSON)
      SELECT id FROM books
      ${whereClause ? sql`WHERE ${whereClause}` : sql``}
    `);

        // postgres-js devolve o resultado do EXPLAIN como array direto de
        // linhas (não `{ rows: [...] }`) — mesmo padrão já usado na Task 2.
        const rows = explainResult as unknown as { 'QUERY PLAN': unknown }[];
        const plan = rows[0]?.['QUERY PLAN'] as
            | [{ Plan?: { 'Plan Rows'?: number } }]
            | undefined;
        return plan?.[0]?.Plan?.['Plan Rows'] ?? 0;
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
                publication_year: books.publication_year,
                publisher: books.publisher,
                series: books.series,
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
                date_started: books.date_started,
                date_finished: books.date_finished,
                createdAt: books.createdAt,
                authors: sql<string[]>`array_agg(${authors.name})`,
                thumbhash: books.thumbhash,
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
      .orderBy(books.createdAt)
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