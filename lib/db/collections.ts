// lib/db/collections.ts
import { sql, eq, asc } from 'drizzle-orm';
import { books, collections, bookCollections } from './schema';
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
}

/** Ordenada por nome: o dono procura pelo nome, não pela data de criação. */
export async function fetchCollections(
  userId: string
): Promise<CollectionWithCount[]> {
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
      })
      .from(bookCollections)
      .innerJoin(books, eq(books.id, bookCollections.bookId))
      .where(eq(bookCollections.collectionId, id))
      .orderBy(asc(bookCollections.addedAt))
  );
}
