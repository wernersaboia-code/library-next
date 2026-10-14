export interface CatalogPosition {
  query: string;
  bookId: number;
  offset: number;
  savedAt: number;
}

export function readCatalogPosition(value: string | null, query: string, now = Date.now()): CatalogPosition | null {
  try {
    const position = JSON.parse(value ?? 'null') as CatalogPosition | null;
    if (!position || position.query !== query || !Number.isSafeInteger(position.bookId)
      || position.bookId <= 0 || !Number.isFinite(position.offset)
      || !Number.isFinite(position.savedAt) || position.savedAt > now
      || now - position.savedAt > 24 * 60 * 60 * 1000) return null;
    return position;
  } catch { return null; }
}
