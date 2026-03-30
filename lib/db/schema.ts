// lib/db/schema.ts
import {
    pgTable,
    serial,
    text,
    integer,
    timestamp,
    decimal,
    primaryKey,
    index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export type SelectBook = typeof books.$inferSelect;
export type Book = Pick<SelectBook, 'id' | 'title' | 'image_url' | 'thumbhash'>;
export type SelectAuthor = typeof authors.$inferSelect;
export type Author = Pick<SelectAuthor, 'id' | 'name'>;

export const READ_STATUS = {
    LIDO: 'lido',
    LENDO: 'lendo',
    NAO_LIDO: 'não lido',
} as const;

export type ReadStatus = (typeof READ_STATUS)[keyof typeof READ_STATUS];

export const authors = pgTable('authors', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
});

export const books = pgTable(
    'books',
    {
        id: serial('id').primaryKey(),

        // Identificação
        isbn: text('isbn').unique(),
        isbn13: text('isbn13'),
        title: text('title').notNull(),

        // Publicação
        publication_year: integer('publication_year'),
        publisher: text('publisher'),
        series: text('series'),         // ex: "Harry Potter" ou null
        language_code: text('language_code'),

        // Conteúdo
        description: text('description'),
        genre: text('genre'),           // ex: "Ficção Científica"
        num_pages: integer('num_pages'),

        // Avaliação (Goodreads ou pessoal)
        average_rating: decimal('average_rating', { precision: 3, scale: 2 }),
        ratings_count: integer('ratings_count'),
        text_reviews_count: integer('text_reviews_count'),

        // Status de leitura
        read_status: text('read_status').default('não lido'),

        // Imagem
        image_url: text('image_url'),
        thumbhash: text('thumbhash'),

        // Busca
        title_tsv: text('title_tsv').notNull(),

        // Controle
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => ({
        titleTsvIdx: index('idx_books_title_tsv').using(
            'gin',
            sql`to_tsvector('english', ${table.title_tsv})`
        ),
        publicationYearIdx: index('idx_books_publication_year').on(
            table.publication_year
        ),
        averageRatingIdx: index('idx_books_average_rating').on(
            table.average_rating
        ),
        languageCodeIdx: index('idx_books_language_code').on(table.language_code),
        numPagesIdx: index('idx_books_num_pages').on(table.num_pages),
        createdAtIdx: index('idx_books_created_at').on(table.createdAt),
        isbnIdx: index('idx_books_isbn').on(table.isbn),
        genreIdx: index('idx_books_genre').on(table.genre),
        readStatusIdx: index('idx_books_read_status').on(table.read_status),
        seriesIdx: index('idx_books_series').on(table.series),
        coveringIdx: index('idx_books_id_title_image_url_thumbhash').on(
            table.id,
            table.title,
            table.image_url,
            table.thumbhash
        ),
    })
);

export const bookToAuthor = pgTable(
    'book_to_author',
    {
        bookId: integer('book_id')
            .notNull()
            .references(() => books.id),
        authorId: text('author_id')
            .notNull()
            .references(() => authors.id),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.bookId, t.authorId] }),
    })
);

export const booksRelations = relations(books, ({ many }) => ({
    bookToAuthor: many(bookToAuthor),
}));

export const authorsRelations = relations(authors, ({ many }) => ({
    bookToAuthor: many(bookToAuthor),
}));

export const bookToAuthorRelations = relations(bookToAuthor, ({ one }) => ({
    book: one(books, {
        fields: [bookToAuthor.bookId],
        references: [books.id],
    }),
    author: one(authors, {
        fields: [bookToAuthor.authorId],
        references: [authors.id],
    }),
}));