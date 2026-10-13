export function authorHref(id: string): string {
  return `/autores/${encodeURIComponent(id)}`;
}

export function seriesHref(name: string): string {
  return `/series?${new URLSearchParams({ nome: name.trim() })}`;
}

/** Aceita somente destinos locais das páginas de autores/séries para o botão Voltar. */
export function browseReturnHref(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000 || !value.startsWith('/') || value.startsWith('//')) return null;
  try {
    const url = new URL(value, 'https://catalog.invalid');
    if (url.origin !== 'https://catalog.invalid' || url.hash) return null;
    const author = /^\/autores(?:\/[^/]+)?$/.test(url.pathname);
    if (!author && url.pathname !== '/series') return null;
    if ([...url.searchParams.keys()].some((key) => key !== 'page' && !(key === 'nome' && url.pathname === '/series'))) return null;
    return url.pathname + url.search;
  } catch { return null; }
}
