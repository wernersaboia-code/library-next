import 'server-only';
import { sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/with-user';

/**
 * Teto por janela de uma hora, contado por usuário e endpoint.
 *
 * O upsert é atômico (`insert ... on conflict ... do update`): duas
 * requisições simultâneas do mesmo usuário não conseguem furar o limite,
 * pois o banco serializa o incremento da mesma linha. A chamada SEMPRE
 * conta — mesmo quando estoura o limite — este é o comportamento
 * pretendido de um limitador simples, não uma omissão.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  limit: number
): Promise<{ allowed: boolean; remaining: number }> {
  return withUser(userId, async (tx) => {
    const res = await tx.execute(sql`
      insert into api_usage (user_id, endpoint, window_start, count)
      values (${userId}, ${endpoint}, date_trunc('hour', now()), 1)
      on conflict (user_id, endpoint, window_start)
        do update set count = api_usage.count + 1
      returning count
    `);
    const rows = res as unknown as { count: number }[];
    const count = Number(rows[0].count);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  });
}
