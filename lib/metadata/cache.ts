import 'server-only';
import type { MetadataProvider, MetadataRecord } from './types';
import { toIsbn13 } from './util';

const TTL_MS = 5 * 60_000;
const DEADLINE_MS = 18_000;
const MAX_ENTRIES = 200;
const cache = new Map<string, { expires: number; records: MetadataRecord[] }>();
const pending = new Map<string, Promise<MetadataRecord[]>>();

/** Cache limitado por processo. Falhas não são memorizadas; buscas em voo são compartilhadas. */
export function cachedProviderSearch(provider: MetadataProvider, query: string): Promise<MetadataRecord[]> {
  const key = `${provider.source}:${toIsbn13(query) ?? query.trim().replace(/\s+/g, ' ').toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.records);
  if (hit) cache.delete(key);
  const existing = pending.get(key);
  if (existing) return existing;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('A fonte excedeu o tempo de consulta.'));
    }, DEADLINE_MS);
  });
  const request = Promise.race([Promise.resolve().then(() => provider.search(query, { signal: controller.signal })), deadline])
    .then((records) => {
      for (const [cachedKey, value] of cache) if (value.expires <= Date.now()) cache.delete(cachedKey);
      const oldest = cache.keys().next().value;
      if (cache.size >= MAX_ENTRIES && oldest !== undefined) cache.delete(oldest);
      cache.set(key, { expires: Date.now() + TTL_MS, records });
      return records;
    }).finally(() => {
      clearTimeout(timer); pending.delete(key);
    });
  pending.set(key, request);
  return request;
}
