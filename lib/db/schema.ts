// lib/db/schema.ts
import {
  pgTable, serial, text, integer, timestamp, decimal,
  primaryKey, index, uuid, jsonb, numeric, customType,
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
    series: text('series'),
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

export const driveFiles = pgTable(
  'drive_files',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    bookId: integer('book_id').notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    fileId: text('file_id').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes'),
    modifiedTime: text('modified_time'),
    cachedPath: text('cached_path'),
    importedAt: timestamp('imported_at', { withTimezone: true })
      .defaultNow().notNull(),
  },
  (t) => ({
    userBookIdx: index('idx_drive_files_user_book').on(t.userId, t.bookId),
    userFileIdx: index('idx_drive_files_user_file').on(t.userId, t.fileId),
  })
);

export const driveSettings = pgTable('drive_settings', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id').notNull()
    .references(() => appUsers.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').notNull(),
  folderName: text('folder_name'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow().notNull(),
});

export const readingProgress = pgTable('reading_progress', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id').notNull()
    .references(() => appUsers.id, { onDelete: 'cascade' }),
  bookId: integer('book_id').notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  locator: jsonb('locator').default({}).notNull(),
  percentage: numeric('percentage', { precision: 5, scale: 4 }),
  secondsRead: integer('seconds_read').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow().notNull(),
});

export const readingSessions = pgTable('reading_sessions', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id').notNull()
    .references(() => appUsers.id, { onDelete: 'cascade' }),
  bookId: integer('book_id').notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true })
    .defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds').default(0).notNull(),
});

export type Locator =
  | { kind: 'epub'; cfi: string }
  | { kind: 'pdf'; page: number }
  | Record<string, never>;

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
    contextBefore: text('context_before'),
    contextAfter: text('context_after'),

    locator: jsonb('locator').$type<Locator>().default({}).notNull(),
    progress: numeric('progress', { precision: 5, scale: 4 }),

    color: text('color').default('#ffff00').notNull(),
    note: text('note'),
    noteUpdatedAt: timestamp('note_updated_at', { withTimezone: true }),

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
      .on(t.userId, t.bookId, t.progress),
  })
);

export const apiUsage = pgTable(
  'api_usage',
  {
    userId: uuid('user_id').notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').default(0).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.endpoint, t.windowStart] }),
  })
);

export type SelectBook = typeof books.$inferSelect;
export type Book = Pick<SelectBook, 'id' | 'title' | 'image_url' | 'thumbhash'>;
export type SelectAuthor = typeof authors.$inferSelect;
export type Author = Pick<SelectAuthor, 'id' | 'name'>;
export type SelectHighlight = typeof highlights.$inferSelect;

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
