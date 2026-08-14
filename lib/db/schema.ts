// lib/db/schema.ts
import {
  pgTable, serial, text, integer, timestamp, decimal, date,
  primaryKey, index, uuid, customType, boolean, real,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

const tsvector = customType<{ data: string }>({
  dataType() { return 'tsvector'; },
});

export const READ_STATUS = {
  LIDO: 'lido',
  LENDO: 'lendo',
  NAO_LIDO: 'não lido',
} as const;
export type ReadStatus = (typeof READ_STATUS)[keyof typeof READ_STATUS];

export const appUsers = pgTable('app_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow().notNull(),
});

export const authors = pgTable('authors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

export const books = pgTable(
  'books',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),

    isbn: text('isbn'),
    isbn13: text('isbn13'),
    title: text('title').notNull(),

    publication_year: integer('publication_year'),
    publisher: text('publisher'),
    // Nome da série, sem o número do volume — que fica em series_index.
    // Guardar "Nome #2" numa coluna só impedia agrupar volumes da mesma série.
    series: text('series'),
    series_index: real('series_index'),
    language_code: text('language_code'),

    description: text('description'),
    genre: text('genre'),
    num_pages: integer('num_pages'),

    average_rating: decimal('average_rating', { precision: 3, scale: 2 }),
    ratings_count: integer('ratings_count'),
    text_reviews_count: integer('text_reviews_count'),

    read_status: text('read_status').default('não lido').notNull(),

    image_url: text('image_url'),
    thumbhash: text('thumbhash'),

    title_source: text('title_source').notNull(),
    title_tsv: tsvector('title_tsv'),

    my_rating: integer('my_rating'),
    date_started: date('date_started'),
    date_finished: date('date_finished'),

    calibre_uuid: text('calibre_uuid'),
    calibre_modified: text('calibre_modified'),
    source: text('source').notNull().default('calibre'),
    owned: boolean('owned').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow().notNull(),
  },
  (t) => ({
    userIsbnIdx: index('idx_books_user_isbn').on(t.userId, t.isbn),
    userCreatedIdx: index('idx_books_user_created').on(t.userId, t.createdAt),
    userStatusIdx: index('idx_books_user_status').on(t.userId, t.read_status),
    userGenreIdx: index('idx_books_user_genre').on(t.userId, t.genre),
    userSeriesIdx: index('idx_books_user_series').on(t.userId, t.series),
    yearIdx: index('idx_books_publication_year').on(t.publication_year),
    ratingIdx: index('idx_books_average_rating').on(t.average_rating),
    langIdx: index('idx_books_language_code').on(t.language_code),
    pagesIdx: index('idx_books_num_pages').on(t.num_pages),
    userOwnedIdx: index('idx_books_user_owned').on(t.userId, t.owned),
  })
);

export const bookToAuthor = pgTable(
  'book_to_author',
  {
    bookId: integer('book_id').notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    authorId: text('author_id').notNull()
      .references(() => authors.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.bookId, t.authorId] }) })
);

export const collections = pgTable(
  'collections',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow().notNull(),
  },
  (t) => ({ userIdx: index('idx_collections_user').on(t.userId) })
);

// O índice único de (user_id, lower(name)) vive só na migration: índice
// sobre expressão não é expressável de forma confiável aqui, e as migrations
// deste projeto são escritas à mão. O 409 de nome repetido depende dele.
export const bookCollections = pgTable(
  'book_collections',
  {
    bookId: integer('book_id').notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    collectionId: integer('collection_id').notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true })
      .defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.collectionId, t.bookId] }),
    bookIdx: index('idx_book_collections_book').on(t.bookId),
  })
);

export const highlights = pgTable(
  'highlights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    bookId: integer('book_id').notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),

    textContent: text('text_content'),

    color: text('color').default('#ffff00').notNull(),
    note: text('note'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow().notNull(),

    searchTsv: tsvector('search_tsv'),
  },
  (t) => ({
    searchIdx: index('idx_highlights_search').using('gin', t.searchTsv),
    userCreatedIdx: index('idx_highlights_user_created')
      .on(t.userId, t.createdAt),
    userBookIdx: index('idx_highlights_user_book')
      .on(t.userId, t.bookId),
  })
);

export type SelectBook = typeof books.$inferSelect;
export type Book = Pick<
  SelectBook,
  'id' | 'title' | 'image_url' | 'thumbhash' | 'read_status' | 'my_rating'
>;
export type SelectAuthor = typeof authors.$inferSelect;
export type Author = Pick<SelectAuthor, 'id' | 'name'>;
export type SelectHighlight = typeof highlights.$inferSelect;
export type SelectCollection = typeof collections.$inferSelect;

export const booksRelations = relations(books, ({ many }) => ({
  bookToAuthor: many(bookToAuthor),
  highlights: many(highlights),
}));

export const authorsRelations = relations(authors, ({ many }) => ({
  bookToAuthor: many(bookToAuthor),
}));

export const bookToAuthorRelations = relations(bookToAuthor, ({ one }) => ({
  book: one(books, { fields: [bookToAuthor.bookId], references: [books.id] }),
  author: one(authors, {
    fields: [bookToAuthor.authorId], references: [authors.id],
  }),
}));
