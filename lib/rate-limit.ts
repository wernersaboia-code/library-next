type Bucket = { startedAt: number; count: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

/** Limite local para conter rajadas; a autenticação continua obrigatória. */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const current = buckets.get(key);

  // O processo da Vercel costuma ser reciclado, mas este limite impede que
  // uma instância persistente acumule uma entrada por usuário indefinidamente.
  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (now - bucket.startedAt >= windowMs) buckets.delete(bucketKey);
    }
  }

  if (!current || now - current.startedAt >= windowMs) {
    buckets.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfter: 0 };
  }

  current.count += 1;
  if (current.count <= limit) return { allowed: true, retryAfter: 0 };

  return {
    allowed: false,
    retryAfter: Math.ceil((windowMs - (now - current.startedAt)) / 1000),
  };
}
