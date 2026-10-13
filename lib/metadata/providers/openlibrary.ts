import { searchExternalBooks } from '@/lib/openlibrary';
import type { MetadataProvider, MetadataRecord } from '../types';
import { toIsbn13, yearOf } from '../util';
import { normalizeLanguage } from '@/lib/languages';

async function byIsbn(isbn: string, parentSignal?: AbortSignal): Promise<MetadataRecord[]> {
  const signal = parentSignal ? AbortSignal.any([parentSignal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
  const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, { signal });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Open Library respondeu ${res.status}`);
  const edition = await res.json() as {
    title?: string; authors?: { key?: string }[]; publishers?: string[];
    languages?: { key?: string }[]; number_of_pages?: number; publish_date?: string;
    covers?: number[]; description?: string | { value?: string };
  };
  if (!edition.title) return [];
  const names = await Promise.allSettled((edition.authors ?? []).slice(0, 12).map(async (author) => {
    if (!author.key || !/^\/authors\/OL\d+A$/.test(author.key)) return null;
    const response = await fetch(`https://openlibrary.org${author.key}.json`, { signal });
    if (!response.ok) return null;
    const data = await response.json() as { name?: string };
    return data.name ?? null;
  }));
  const cover = edition.covers?.find((id) => id > 0);
  return [{ source: 'openlibrary', confidence: 0.9, title: edition.title,
    authors: names.flatMap((r) => r.status === 'fulfilled' && r.value ? [r.value] : []),
    isbn13: isbn, publisher: edition.publishers?.[0] ?? null,
    publicationYear: yearOf(edition.publish_date), numPages: edition.number_of_pages ?? null,
    language: normalizeLanguage(edition.languages?.[0]?.key?.split('/').pop()),
    description: typeof edition.description === 'string' ? edition.description : edition.description?.value ?? null,
    cover: cover ? { provider: 'openlibrary', id: String(cover) } : null,
    ratingsAverage: null, ratingsCount: null }];
}

/** Open Library: já traz avaliações e capa por id numérico (fonte mais rica). */
export const openLibraryProvider: MetadataProvider = {
  source: 'openlibrary',
  async search(query, options): Promise<MetadataRecord[]> {
    const isbn = toIsbn13(query);
    if (isbn) return byIsbn(isbn, options?.signal);
    const livros = await searchExternalBooks(query, options?.signal);
    return livros.map((livro) => ({
      source: 'openlibrary' as const,
      confidence: 0.8,
      title: livro.title,
      authors: livro.authors ?? (livro.author ? [livro.author] : []),
      publicationYear: livro.publicationYear,
      numPages: livro.numPages,
      publisher: null,
      language: null,
      description: null,
      isbn13: null,
      cover:
        livro.coverId !== null
          ? { provider: 'openlibrary' as const, id: String(livro.coverId) }
          : null,
      ratingsAverage: livro.ratingsAverage,
      ratingsCount: livro.ratingsCount,
    }));
  },
};
