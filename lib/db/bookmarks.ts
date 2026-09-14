import 'server-only';
import { cache } from 'react';
import { asc, eq } from 'drizzle-orm';
import { withUser } from './with-user';
import { bookmarks } from './schema';

export interface Bookmark {
  id: string;
  locator: unknown;
  label: string | null;
  createdAt: string;
}

/**
 * Marcadores de um livro. Mesma forma que a rota /api/books/[id]/bookmarks
 * devolve — o cliente reutiliza esta forma depois de cada mutação, e a página
 * do livro renderiza o estado inicial vindo daqui.
 */
export const fetchBookmarks = cache(
  async (userId: string, bookId: number): Promise<Bookmark[]> => {
    const rows = await withUser(userId, (tx) =>
      tx
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.bookId, bookId))
        .orderBy(asc(bookmarks.createdAt))
    );

    return rows.map((r) => ({
      id: r.id,
      locator: r.locator,
      label: r.label,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    }));
  }
);
