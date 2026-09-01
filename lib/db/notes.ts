import 'server-only';
import { cache } from 'react';
import { and, asc, eq, inArray } from 'drizzle-orm';
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

export interface NoteComment {
  id: string;
  note: string | null;
}

/**
 * O comentário (highlight `kind: 'note'`) de cada livro em `bookIds`, numa
 * consulta só. Existia um componente por livro em Quero ter que buscava o
 * seu próprio comentário ao montar — com dezenas de livros na lista, isso
 * virava dezenas de conexões simultâneas ao Postgres e estourava o limite do
 * pooler do Supabase (200 clientes), derrubando o site inteiro. A página
 * busca aqui, de uma vez, e passa o resultado como estado inicial.
 */
export async function fetchNoteComments(
  userId: string,
  bookIds: number[]
): Promise<Map<number, NoteComment>> {
  if (bookIds.length === 0) return new Map();

  const rows = await withUser(userId, (tx) =>
    tx
      .select({ id: highlights.id, bookId: highlights.bookId, note: highlights.note })
      .from(highlights)
      .where(and(inArray(highlights.bookId, bookIds), eq(highlights.kind, 'note')))
      .orderBy(asc(highlights.createdAt))
  );

  const porLivro = new Map<number, NoteComment>();
  for (const r of rows) {
    if (!porLivro.has(r.bookId)) porLivro.set(r.bookId, { id: r.id, note: r.note });
  }
  return porLivro;
}
