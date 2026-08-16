// lib/db/collections.ts
import { cache } from 'react';
import { sql, eq, asc } from 'drizzle-orm';
import { books, authors, bookToAuthor, collections, bookCollections } from './schema';
import { withUser } from './with-user';

export interface CollectionWithCount {
  id: number;
  name: string;
  total: number;
}

export interface CollectionBook {
  id: number;
  title: string;
  image_url: string | null;
  thumbhash: string | null;
  read_status: string;
  my_rating: number | null;
  owned: boolean;
  next_up: boolean;
  favorite: boolean;
  authors: string[];
}

/** Ordenada por nome: o dono procura pelo nome, não pela data de criação. */
// `cache` deduplica em escopo de request: layout (sidebar) e página (seleção)
// pedem as mesmas coleções no mesmo request, e sem isso seriam duas
// transações idênticas no banco.
export const fetchCollections = cache(
  async (userId: string): Promise<CollectionWithCount[]> => {
    const rows = await withUser(userId, (tx) =>
      tx
        .select({
          id: collections.id,
          name: collections.name,
          // count sobre a coluna do leftJoin (não count(*)): biblioteca sem
          // livro precisa devolver 0, e count(*) devolveria 1.
          total: sql<number>`count(${bookCollections.bookId})`,
        })
        .from(collections)
        .leftJoin(
          bookCollections,
          eq(bookCollections.collectionId, collections.id)
        )
        .groupBy(collections.id)
        .orderBy(asc(collections.name))
    );

    return rows.map((r) => ({ ...r, total: Number(r.total) }));
  }
);

export async function fetchCollection(
  userId: string,
  id: number
): Promise<{ id: number; name: string } | undefined> {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ id: collections.id, name: collections.name })
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1)
  );
  return rows[0];
}

export async function fetchCollectionBooks(
  userId: string,
  id: number
): Promise<CollectionBook[]> {
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
      .from(bookCollections)
      .innerJoin(books, eq(books.id, bookCollections.bookId))
      .leftJoin(bookToAuthor, eq(books.id, bookToAuthor.bookId))
      .leftJoin(authors, eq(bookToAuthor.authorId, authors.id))
      .where(eq(bookCollections.collectionId, id))
      .groupBy(books.id, bookCollections.addedAt)
      .orderBy(asc(bookCollections.addedAt), asc(books.id))
  );
}
