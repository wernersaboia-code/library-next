import { normalizeText, toIsbn13 } from './metadata/util';

export interface DuplicateQuery {
  title: string;
  authors: string[];
  isbn13: string | null;
  sha256: string | null;
}

export interface DuplicateCandidate {
  id: number;
  title: string;
  authors: string[];
  isbn13: string | null;
  sha256: string | null;
  hasFile: boolean;
  owned: boolean;
}

export interface DuplicateBook extends DuplicateCandidate {
  reason: 'arquivo' | 'isbn' | 'titulo-autor' | 'titulo';
}

/** Correspondência sugere revisão; nunca une cadastros automaticamente. */
export function matchDuplicates(query: DuplicateQuery, candidates: DuplicateCandidate[]): DuplicateBook[] {
  const title = normalizeText(query.title);
  const isbn = toIsbn13(query.isbn13);
  const names = query.authors.map(normalizeText).filter(Boolean);
  const matches: DuplicateBook[] = [];
  for (const candidate of candidates) {
    let reason: DuplicateBook['reason'] | null = null;
    if (query.sha256 && candidate.hasFile && query.sha256.toLowerCase() === candidate.sha256?.toLowerCase()) reason = 'arquivo';
    else if (isbn && isbn === toIsbn13(candidate.isbn13)) reason = 'isbn';
    else if (title && title === normalizeText(candidate.title)) {
      const existingNames = candidate.authors.map(normalizeText).filter(Boolean);
      if (names.length === 0 || existingNames.length === 0) reason = 'titulo';
      else if (names.some((name) => existingNames.includes(name))) reason = 'titulo-autor';
    }
    if (reason) matches.push({ ...candidate, reason });
  }
  const rank = { arquivo: 0, isbn: 1, 'titulo-autor': 2, titulo: 3 };
  return matches.sort((a, b) => rank[a.reason] - rank[b.reason]);
}
