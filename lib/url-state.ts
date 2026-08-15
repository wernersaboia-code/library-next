// lib/url-state.ts
export interface SearchParams {
  search?: string;
  yr?: string;      // ano de publicação (máximo)
  rtg?: string;     // avaliação mínima
  lng?: string;     // idioma
  pgs?: string;     // número máximo de páginas
  page?: string;    // paginação
  isbn?: string;    // ISBN direto
  genre?: string;   // gênero
  status?: string;  // lido | lendo | não lido
  series?: string;  // 'sim' | 'não'
  pub?: string;     // editora
  posse?: string;   // possuidos | nao-possuidos | todos
  bib?: string;     // id da biblioteca (coleção)
}

export function parseSearchParams(
    params: Record<string, string | string[] | undefined>
): SearchParams {
  return {
    search: typeof params.search === 'string' ? params.search : undefined,
    yr: typeof params.yr === 'string' ? params.yr : undefined,
    rtg: typeof params.rtg === 'string' ? params.rtg : undefined,
    lng: typeof params.lng === 'string' ? params.lng : undefined,
    pgs: typeof params.pgs === 'string' ? params.pgs : undefined,
    page: typeof params.page === 'string' ? params.page : undefined,
    isbn: typeof params.isbn === 'string' ? params.isbn : undefined,
    genre: typeof params.genre === 'string' ? params.genre : undefined,
    status: typeof params.status === 'string' ? params.status : undefined,
    series: typeof params.series === 'string' ? params.series : undefined,
    pub: typeof params.pub === 'string' ? params.pub : undefined,
    posse: typeof params.posse === 'string' ? params.posse : undefined,
    bib: typeof params.bib === 'string' ? params.bib : undefined,
  };
}

/**
 * Aplica um filtro e volta para a primeira página.
 *
 * Sem o descarte de `page`, filtrar estando numa página adiantada mantinha o
 * offset antigo: o catálogo vinha vazio mesmo havendo resultados — filtrar
 * "Lido" na página 5 pedia os livros 113 em diante de um conjunto de 3.
 */
export function applyFilter(
    params: SearchParams,
    key: keyof SearchParams,
    value: string | undefined
): SearchParams {
  const next = { ...params, [key]: value };
  delete next.page;
  return next;
}

export function stringifySearchParams(params: SearchParams): string {
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      urlParams.append(key, value);
    }
  });
  return urlParams.toString();
}
/**
 * A página pedida, limitada ao que existe. Um valor fora da faixa é preso ao
 * intervalo em vez de virar erro: pedir a página 99 de 42 leva à última, que
 * é o que a pessoa queria. Fica no servidor porque a URL é editável à mão.
 */
export function paginaValida(entrada: unknown, totalPaginas: number): number {
  const ultima = Math.max(1, totalPaginas);
  const n = Number(entrada);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, ultima);
}
