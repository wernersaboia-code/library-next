export interface CalibreBookInput {
  uuid: string;
  lastModified: string;
  title: string;
  authors: string[];
  publicationYear: number | null;
  publisher: string | null;
  /** Nome da série, sem o número do volume. */
  series: string | null;
  /** Volume dentro da série. Fracionário no Calibre (1.5 existe). */
  seriesIndex: number | null;
  languageCode: string | null;
  description: string | null;
  genre: string | null;
  numPages: number | null;
  averageRating: string | null;
  isbn: string | null;
  isbn13: string | null;
  hasCover: boolean;
  /** Caminho relativo da pasta do livro no Calibre (coluna `path`), onde vive cover.jpg */
  path: string;
}

export interface ExistingBook {
  id: number;
  calibreModified: string | null;
}

export type SyncDecision =
  | { kind: 'insert' }
  | { kind: 'update'; bookId: number }
  | { kind: 'skip'; bookId: number };

export function decideSync(
  input: CalibreBookInput,
  existing: ExistingBook | undefined
): SyncDecision {
  if (!existing) return { kind: 'insert' };
  if (existing.calibreModified === input.lastModified) {
    return { kind: 'skip', bookId: existing.id };
  }
  return { kind: 'update', bookId: existing.id };
}

/**
 * Campos de catálogo que o sync tem permissão de escrever — e só eles. Este
 * tipo é a proteção estrutural contra o sync tocar tracking (read_status,
 * my_rating, datas) ou posse (owned, source): como `metadataValues` devolve
 * exatamente este shape, e o `set`/`values` do Drizzle usa esse retorno sem
 * cast, o compilador rejeita qualquer campo fora desta lista.
 */
export interface CatalogMetadata {
  title: string;
  title_source: string;
  isbn: string | null;
  isbn13: string | null;
  publication_year: number | null;
  publisher: string | null;
  series: string | null;
  series_index: number | null;
  language_code: string | null;
  description: string | null;
  genre: string | null;
  num_pages: number | null;
  average_rating: string | null;
  calibre_modified: string;
}

/**
 * Só metadados de catálogo. Tracking (read_status, my_rating, datas) e posse
 * (owned, source) ficam de fora por decisão de arquitetura — ver AD-3 da spec.
 */
export function metadataValues(input: CalibreBookInput): CatalogMetadata {
  return {
    title: input.title,
    title_source: input.title,
    isbn: input.isbn,
    isbn13: input.isbn13,
    publication_year: input.publicationYear,
    publisher: input.publisher,
    series: input.series,
    series_index: input.seriesIndex,
    language_code: input.languageCode,
    description: input.description,
    genre: input.genre,
    num_pages: input.numPages,
    average_rating: input.averageRating,
    calibre_modified: input.lastModified,
  };
}
