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
  };
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