import 'server-only';
import { and, asc, eq, sql } from 'drizzle-orm';
import { withUser } from './with-user';
import { books, authors, bookToAuthor, highlights } from './schema';
import type { ReadingExport } from '@/lib/reading-export';

/** A exportação respeita RLS e filtra explicitamente os dois lados da associação. */
export function fetchReadingExport(userId: string): Promise<ReadingExport> {
  return withUser(userId, async (tx) => {
    const exportedBooks = await tx.select({
      id: books.id, title: books.title,
      authors: sql<string[]>`array_remove(array_agg(${authors.name} ORDER BY ${authors.name}), NULL)`,
      read_status: books.read_status, my_rating: books.my_rating,
      progress_percent: books.progress_percent, date_started: books.date_started,
      date_finished: books.date_finished, dnf_reason: books.dnf_reason,
      last_locator: books.last_locator,
    }).from(books).leftJoin(bookToAuthor, eq(bookToAuthor.bookId, books.id))
      .leftJoin(authors, eq(authors.id, bookToAuthor.authorId))
      .where(eq(books.userId, userId)).groupBy(books.id).orderBy(asc(books.title), asc(books.id));
    const notes = await tx.select({
      bookId: highlights.bookId, kind: highlights.kind, textContent: highlights.textContent,
      note: highlights.note, createdAt: highlights.createdAt, locator: highlights.locator,
    }).from(highlights).innerJoin(books, eq(books.id, highlights.bookId))
      .where(and(eq(highlights.userId, userId), eq(books.userId, userId)))
      .orderBy(asc(highlights.createdAt), asc(highlights.id));
    return { books: exportedBooks, notes };
  });
}
