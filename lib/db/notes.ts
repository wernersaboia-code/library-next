import 'server-only';
import { cache } from 'react';
import { asc, eq } from 'drizzle-orm';
import { withUser } from './with-user';
import { highlights } from './schema';

export interface Note {
  id: string;
  kind: string;
  textContent: string | null;
  note: string | null;
  createdAt: string;
}

/**
 * Notas e citações de um livro. É o mesmo formato que a rota
 * /api/books/[id]/notes devolve — o cliente reutiliza esta forma depois de
 * cada mutação, e a página do livro agora renderiza o estado inicial vindo
 * daqui em vez de buscar de novo após a hidratação.
 */
export const fetchNotes = cache(
  async (userId: string, bookId: number): Promise<Note[]> => {
    const rows = await withUser(userId, (tx) =>
      tx
        .select()
        .from(highlights)
        .where(eq(highlights.bookId, bookId))
        .orderBy(asc(highlights.createdAt))
    );

    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      textContent: r.textContent,
      note: r.note,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    }));
  }
);
