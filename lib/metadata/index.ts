import { aggregate } from './aggregate';
import { enabledProviders } from './providers';
import { cachedProviderSearch } from './cache';
import type { AggregatedBook, MetadataRecord, MetadataSource } from './types';

export interface MetadataSearchResult {
  books: AggregatedBook[];
  falhas: { source: MetadataSource; message: string }[];
  allFailed: boolean;
}

/**
 * Consulta todas as fontes em paralelo e devolve os livros mesclados. Uma
 * fonte que falha não derruba as outras: o erro vai em `falhas` e o resultado
 * segue com o que veio das demais.
 */
export async function searchMetadata(query: string): Promise<MetadataSearchResult> {
  const providers = enabledProviders();
  const resultados = await Promise.allSettled(
    providers.map((provider) => cachedProviderSearch(provider, query))
  );

  const records: MetadataRecord[] = [];
  const falhas: { source: MetadataSource; message: string }[] = [];

  resultados.forEach((resultado, i) => {
    const provider = providers[i];
    if (!provider) return;
    if (resultado.status === 'fulfilled') {
      records.push(...resultado.value);
    } else {
      falhas.push({
        source: provider.source,
        message:
          resultado.reason instanceof Error
            ? resultado.reason.message
            : String(resultado.reason),
      });
    }
  });

  return { books: aggregate(records), falhas, allFailed: resultados.every((r) => r.status === 'rejected') };
}

export * from './types';
