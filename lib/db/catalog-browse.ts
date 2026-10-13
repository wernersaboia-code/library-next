import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { authors, books, bookToAuthor, type Book } from './schema';
import { withUser } from './with-user';

export const BROWSE_PAGE_SIZE = 28;
export interface CatalogGroup { id: string; name: string; total: number }
export type BrowseBook = Book & { authors: string[]; series_index: number | null };
const seriesName = sql<string>`trim(${books.series})`;

export async function fetchCatalogAuthors(userId: string): Promise<CatalogGroup[]> {
  return withUser(userId, (tx) => tx.select({ id: authors.id, name: authors.name,
    total: sql<number>`count(distinct ${books.id})::int` })
    .from(authors).innerJoin(bookToAuthor, eq(bookToAuthor.authorId, authors.id))
    .innerJoin(books, eq(books.id, bookToAuthor.bookId))
    .where(eq(books.userId, userId)).groupBy(authors.id, authors.name)
    .orderBy(asc(authors.name), asc(authors.id)));
}

export async function fetchCatalogAuthor(userId: string, id: string): Promise<CatalogGroup | undefined> {
  return withUser(userId, async (tx) => {
    const [author] = await tx.select({ id: authors.id, name: authors.name,
      total: sql<number>`count(distinct ${books.id})::int` })
      .from(authors).innerJoin(bookToAuthor, eq(bookToAuthor.authorId, authors.id))
      .innerJoin(books, eq(books.id, bookToAuthor.bookId))
      .where(and(eq(books.userId, userId), eq(authors.id, id)))
      .groupBy(authors.id, authors.name).limit(1);
    return author;
  });
}

export async function fetchCatalogSeries(userId: string): Promise<CatalogGroup[]> {
  return withUser(userId, (tx) => tx.select({ id: seriesName, name: seriesName,
    total: sql<number>`count(*)::int` }).from(books)
    .where(and(eq(books.userId, userId), sql`${seriesName} <> ''`))
    .groupBy(seriesName).orderBy(asc(seriesName)));
}

export async function fetchCatalogSeriesGroup(userId: string, name: string): Promise<CatalogGroup | undefined> {
  if (!name.trim()) return undefined;
  return withUser(userId, async (tx) => {
    const [series] = await tx.select({ id: seriesName, name: seriesName,
      total: sql<number>`count(*)::int` }).from(books)
      .where(and(eq(books.userId, userId), eq(seriesName, name.trim())))
      .groupBy(seriesName).limit(1);
    return series;
  });
}

export async function fetchCatalogGroupBooks(userId: string, scope: { authorId: string } | { series: string }, page: number): Promise<BrowseBook[]> {
  const currentPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return withUser(userId, (tx) => {
    const filter = 'authorId' in scope
      ? inArray(books.id, tx.select({ id: bookToAuthor.bookId }).from(bookToAuthor).where(eq(bookToAuthor.authorId, scope.authorId)))
      : eq(seriesName, scope.series.trim());
    return tx.select({ id: books.id, title: books.title, image_url: books.image_url, thumbhash: books.thumbhash,
      read_status: books.read_status, my_rating: books.my_rating, owned: books.owned,
      next_up: books.next_up, favorite: books.favorite, series_index: books.series_index,
      authors: sql<string[]>`array_remove(array_agg(${authors.name} order by ${authors.name}), NULL)`,
    }).from(books).leftJoin(bookToAuthor, eq(bookToAuthor.bookId, books.id))
      .leftJoin(authors, eq(authors.id, bookToAuthor.authorId))
      .where(and(eq(books.userId, userId), filter)).groupBy(books.id)
      .orderBy(...('series' in scope ? [asc(books.series_index)] : []), asc(books.title), asc(books.id))
      .limit(BROWSE_PAGE_SIZE).offset((currentPage - 1) * BROWSE_PAGE_SIZE);
  });
}
