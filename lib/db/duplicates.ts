import 'server-only';
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { books, authors, bookToAuthor, bookFiles } from './schema';
import type { UserTransaction } from './with-user';
import { matchDuplicates, type DuplicateQuery } from '@/lib/book-duplicates';
import { normalizeText, toIsbn10 } from '@/lib/metadata/util';

export async function findDuplicates(tx: UserTransaction, userId: string, query: DuplicateQuery) {
  const conditions: SQL[] = [];
  if (query.isbn13) {
    const identifiers = [query.isbn13, toIsbn10(query.isbn13)].filter((isbn): isbn is string => Boolean(isbn));
    conditions.push(or(inArray(books.isbn13, identifiers), inArray(books.isbn, identifiers)) as SQL);
  }
  if (query.sha256) conditions.push(inArray(books.id, tx.select({ id: bookFiles.bookId }).from(bookFiles)
    .where(and(eq(bookFiles.userId, userId), eq(bookFiles.sha256, query.sha256), eq(bookFiles.hasFile, true)))));
  if (query.title.trim()) conditions.push(eq(sql<string>`trim(regexp_replace(
    regexp_replace(normalize(lower(${books.title}), NFD), '[̀-ͯ]', '', 'g'),
    '[^a-z0-9]+', ' ', 'g'))`, normalizeText(query.title)));
  if (!conditions.length) return [];
  const rows = await tx.select({ id: books.id, title: books.title,
    authors: sql<string[]>`array_remove(array_agg(distinct ${authors.name}), NULL)`,
    isbn13: sql<string | null>`coalesce(${books.isbn13}, ${books.isbn})`,
    sha256: bookFiles.sha256, hasFile: books.has_file, owned: books.owned,
  }).from(books)
    .leftJoin(bookToAuthor, eq(bookToAuthor.bookId, books.id))
    .leftJoin(authors, eq(authors.id, bookToAuthor.authorId))
    .leftJoin(bookFiles, and(eq(bookFiles.bookId, books.id), eq(bookFiles.userId, userId)))
    .where(and(eq(books.userId, userId), or(...conditions)))
    .groupBy(books.id, bookFiles.sha256)
    .orderBy(books.id);
  return matchDuplicates(query, rows.map((row) => ({ ...row, authors: row.authors ?? [] }))).slice(0, 20);
}
