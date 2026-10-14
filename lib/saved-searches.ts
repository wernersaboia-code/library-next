import { parseSearchParams, stringifySearchParams, type SearchParams } from './url-state';

export interface SavedSearch { id: number; name: string; query: string }

/** Salva somente filtros conhecidos, sem paginação ou destinos arbitrários. */
export function savedSearchQuery(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  const params: SearchParams = parseSearchParams(Object.fromEntries(new URLSearchParams(value)));
  delete params.page;
  for (const key of Object.keys(params) as (keyof SearchParams)[]) {
    if (!params[key]?.trim()) delete params[key];
  }
  for (const key of ['yr', 'rtg', 'pgs', 'bib'] as const) {
    const entry = params[key];
    if (entry && (!Number.isFinite(Number(entry)) || Number(entry) < 0)) return null;
  }
  if (params.status && !['lido', 'lendo', 'não lido', 'abandonado'].includes(params.status)) return null;
  if (params.posse && !['todos', 'possuidos', 'nao-possuidos'].includes(params.posse)) return null;
  if (params.series && !['sim', 'não'].includes(params.series)) return null;
  const query = stringifySearchParams(params);
  return query && query.length <= 2000 ? query : null;
}

export function savedSearchName(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80
    ? value.trim() : null;
}
