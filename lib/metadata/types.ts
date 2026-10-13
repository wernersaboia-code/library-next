export type MetadataSource = 'openlibrary' | 'googlebooks' | 'wikidata';

export interface CoverRef {
  provider: MetadataSource;
  id: string;
}

export interface MetadataRecord {
  source: MetadataSource;
  confidence: number;
  title: string;
  authors: string[];
  publicationYear: number | null;
  numPages: number | null;
  publisher: string | null;
  language: string | null;
  description: string | null;
  isbn13: string | null;
  cover: CoverRef | null;
  ratingsAverage: number | null;
  ratingsCount: number | null;
}

export interface MetadataProvider {
  source: MetadataSource;
  search(query: string, options?: { signal?: AbortSignal }): Promise<MetadataRecord[]>;
}

export type MetadataField =
  | 'title'
  | 'authors'
  | 'publicationYear'
  | 'numPages'
  | 'publisher'
  | 'language'
  | 'description'
  | 'isbn13'
  | 'cover';

export interface AggregatedBook {
  title: string;
  authors: string[];
  publicationYear: number | null;
  numPages: number | null;
  publisher: string | null;
  language: string | null;
  description: string | null;
  isbn13: string | null;
  cover: CoverRef | null;
  ratingsAverage: number | null;
  ratingsCount: number | null;
  sources: MetadataSource[];
  fieldSources: Partial<Record<MetadataField, MetadataSource[]>>;
  conflicts: Partial<Record<MetadataField, { value: string | number | string[]; sources: MetadataSource[] }[]>>;
  confidence: number;
}
