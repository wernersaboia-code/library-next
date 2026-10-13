import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetadataProvider } from '@/lib/metadata/types';

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('cache de metadados', () => {
  it('compartilha buscas simultâneas e expira após cinco minutos', async () => {
    const { cachedProviderSearch } = await import('@/lib/metadata/cache');
    const provider: MetadataProvider = { source: 'openlibrary', search: vi.fn(async () => []) };
    await Promise.all([cachedProviderSearch(provider, ' Duna  '), cachedProviderSearch(provider, 'duna')]);
    await cachedProviderSearch(provider, 'Duna');
    expect(provider.search).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await cachedProviderSearch(provider, 'duna');
    expect(provider.search).toHaveBeenCalledTimes(2);
  });
  it('não armazena falhas nem mistura provedores', async () => {
    const { cachedProviderSearch } = await import('@/lib/metadata/cache');
    const search = vi.fn().mockRejectedValueOnce(new Error('indisponível')).mockResolvedValue([]);
    const provider: MetadataProvider = { source: 'openlibrary', search };
    await expect(cachedProviderSearch(provider, 'Duna')).rejects.toThrow('indisponível');
    await cachedProviderSearch(provider, 'Duna');
    await cachedProviderSearch({ ...provider, source: 'googlebooks' }, 'Duna');
    expect(search).toHaveBeenCalledTimes(3);
  });
  it('interrompe a fonte que ultrapassa o prazo total', async () => {
    const { cachedProviderSearch } = await import('@/lib/metadata/cache');
    let signal: AbortSignal | undefined;
    const provider: MetadataProvider = { source: 'wikidata', search: (_query, options) => {
      signal = options?.signal; return new Promise(() => {});
    } };
    const result = expect(cachedProviderSearch(provider, 'Duna')).rejects.toThrow('tempo');
    await vi.advanceTimersByTimeAsync(18_000); await result;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
