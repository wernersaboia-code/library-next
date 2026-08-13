export interface CalibreBookInput {
  uuid: string;
  lastModified: string;
  title: string;
  authors: string[];
  publicationYear: number | null;
  publisher: string | null;
  series: string | null;
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
 * Só metadados de catálogo. Tracking (read_status, my_rating, datas) e posse
 * (owned, source) ficam de fora por decisão de arquitetura — ver AD-3 da spec.
 */
export function metadataValues(input: CalibreBookInput): Record<string, unknown> {
  return {
    title: input.title,
    title_source: input.title,
    isbn: input.isbn,
    isbn13: input.isbn13,
    publication_year: input.publicationYear,
    publisher: input.publisher,
    series: input.series,
    language_code: input.languageCode,
    description: input.description,
    genre: input.genre,
    num_pages: input.numPages,
    average_rating: input.averageRating,
    calibre_modified: input.lastModified,
  };
}
