// lib/db/queries.ts
import { sql, and, gte, eq, lte, not, isNull, like } from 'drizzle-orm';
import { db } from './drizzle';
import { books, authors, bookToAuthor } from './schema';
import { SearchParams } from '@/lib/url-state';

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
    if (q) {
        const tsQuery = q.trim().split(/\s+/).join(' & ');
        return sql`${books.title_tsv} @@ to_tsquery('english', ${tsQuery})`;
    }
    return undefined;
};

const imageFilter = () => {
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

// — Helpers —

function buildFilters(searchParams: SearchParams) {
    return [
        imageFilter(),
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
    ].filter(Boolean);
}

// — Queries públicas —

export async function fetchBooksWithPagination(searchParams: SearchParams) {
    const requestedPage = Math.max(1, Number(searchParams?.page) || 1);
    const filters = buildFilters(searchParams);
    const whereClause = filters.length > 0 ? and(...filters) : undefined;
    const offset = (requestedPage - 1) * ITEMS_PER_PAGE;

    return db
        .select({
            id: books.id,
            title: books.title,
            image_url: books.image_url,
            thumbhash: books.thumbhash,
        })
        .from(books)
        .where(whereClause)
        .orderBy(books.id)
        .limit(ITEMS_PER_PAGE)
        .offset(offset);
}

export async function estimateTotalBooks(searchParams: SearchParams) {
    const filters = buildFilters(searchParams);
    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const explainResult = await db.execute(sql`
    EXPLAIN (FORMAT JSON)
    SELECT id FROM books
    ${whereClause ? sql`WHERE ${whereClause}` : sql``}
  `);

    const planRows = (explainResult.rows[0] as any)['QUERY PLAN'][0]['Plan'][
        'Plan Rows'
        ];
    return planRows;
}

export async function fetchBookById(id: string) {
    const result = await db
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
            createdAt: books.createdAt,
            authors: sql<string[]>`array_agg(${authors.name})`,
            thumbhash: books.thumbhash,
        })
        .from(books)
        .leftJoin(bookToAuthor, eq(books.id, bookToAuthor.bookId))
        .leftJoin(authors, eq(bookToAuthor.authorId, authors.id))
        .where(eq(books.id, parseInt(id)))
        .groupBy(books.id)
        .limit(1);

    return result[0];
}

// — Queries auxiliares para popular filtros dinamicamente —

export async function fetchDistinctGenres(): Promise<string[]> {
    const result = await db
        .selectDistinct({ genre: books.genre })
        .from(books)
        .where(not(isNull(books.genre)))
        .orderBy(books.genre);

    return result.map((r) => r.genre).filter(Boolean) as string[];
}

export async function fetchDistinctPublishers(): Promise<string[]> {
    const result = await db
        .selectDistinct({ publisher: books.publisher })
        .from(books)
        .where(not(isNull(books.publisher)))
        .orderBy(books.publisher);

    return result.map((r) => r.publisher).filter(Boolean) as string[];
}