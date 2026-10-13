import type { MetadataProvider, MetadataRecord } from '../types';
import { toIsbn13, yearOf } from '../util';

const ENDPOINT = 'https://www.googleapis.com/books/v1/volumes';

interface VolumeInfo {
  title?: string;
  authors?: string[];
  publishedDate?: string;
  pageCount?: number;
  publisher?: string;
  language?: string;
  description?: string;
  industryIdentifiers?: { type?: string; identifier?: string }[];
  imageLinks?: { thumbnail?: string };
}

function isbn13From(info: VolumeInfo): string | null {
  const lista = info.industryIdentifiers ?? [];
  const treze = lista.find((i) => i.type === 'ISBN_13')?.identifier;
  if (treze) return toIsbn13(treze);
  const dez = lista.find((i) => i.type === 'ISBN_10')?.identifier;
  return dez ? toIsbn13(dez) : null;
}

/**
 * Google Books. Sem chave em `GOOGLE_BOOKS_API_KEY` a cota é pequena e pode
 * responder 429; a falha não derruba as outras fontes (o agregador isola).
 */
export const googleBooksProvider: MetadataProvider = {
  source: 'googlebooks',
  async search(query, options): Promise<MetadataRecord[]> {
    const url = new URL(ENDPOINT);
    const isbn = toIsbn13(query);
    url.searchParams.set('q', isbn ? `isbn:${isbn}` : query);
    url.searchParams.set('maxResults', '5');
    url.searchParams.set('printType', 'books');
    const key = process.env.GOOGLE_BOOKS_API_KEY;
    if (key) url.searchParams.set('key', key);

    const signal = options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000);
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Google Books respondeu ${res.status}`);
    const data = (await res.json()) as { items?: { id: string; volumeInfo?: VolumeInfo }[] };
    const items = Array.isArray(data?.items) ? data.items : [];

    return items
      .map((item): MetadataRecord | null => {
        const info = item.volumeInfo;
        if (!info?.title) return null;
        return {
          source: 'googlebooks' as const,
          confidence: 0.85,
          title: info.title,
          authors: Array.isArray(info.authors) ? info.authors : [],
          publicationYear: yearOf(info.publishedDate),
          numPages: Number.isFinite(info.pageCount) ? Number(info.pageCount) : null,
          publisher: info.publisher ?? null,
          language: info.language ?? null,
          description: info.description ?? null,
          isbn13: isbn13From(info),
          cover: info.imageLinks ? { provider: 'googlebooks' as const, id: item.id } : null,
          ratingsAverage: null,
          ratingsCount: null,
        };
      })
      .filter((r): r is MetadataRecord => r !== null);
  },
};
