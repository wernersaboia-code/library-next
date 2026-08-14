// lib/openlibrary.ts
const SEARCH_URL = 'https://openlibrary.org/search.json';
const CAMPOS = [
  'title', 'author_name', 'first_publish_year', 'number_of_pages_median',
  'cover_i', 'ratings_average', 'ratings_count',
].join(',');
const LIMITE = 5;
const TIMEOUT_MS = 5000;

export interface ExternalBook {
  title: string;
  author: string | null;
  publicationYear: number | null;
  numPages: number | null;
  coverId: number | null;
  ratingsAverage: number | null;
  ratingsCount: number | null;
}

export class ExternalSearchError extends Error {
  constructor(message = 'Não foi possível consultar a Open Library') {
    super(message);
    this.name = 'ExternalSearchError';
  }
}

/** Converte para número ou devolve null — nunca 0 por ausência. */
function numeroOuNulo(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function searchExternalBooks(query: string): Promise<ExternalBook[]> {
  const params = new URLSearchParams({
    q: query, limit: String(LIMITE), fields: CAMPOS,
  });

  let data: { docs?: Record<string, unknown>[] };
  try {
    const res = await fetch(`${SEARCH_URL}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new ExternalSearchError();
    data = await res.json();
  } catch (err) {
    if (err instanceof ExternalSearchError) throw err;
    throw new ExternalSearchError();
  }

  return (data.docs ?? []).slice(0, LIMITE).map((doc) => ({
    title: typeof doc.title === 'string' ? doc.title : 'Sem título',
    author: Array.isArray(doc.author_name) && typeof doc.author_name[0] === 'string'
      ? doc.author_name[0] : null,
    publicationYear: numeroOuNulo(doc.first_publish_year),
    numPages: numeroOuNulo(doc.number_of_pages_median),
    coverId: numeroOuNulo(doc.cover_i),
    ratingsAverage: numeroOuNulo(doc.ratings_average),
    ratingsCount: numeroOuNulo(doc.ratings_count),
  }));
}
