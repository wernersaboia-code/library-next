import { sql } from 'drizzle-orm';
import { db } from './drizzle';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Único ponto de acesso a dados de usuário.
 *
 * Abre uma transação e define `app.user_id` com escopo local (obrigatório em
 * conexões pooled/transaction do Supabase). As policies de RLS leem essa
 * variável via `app_current_user_id()` — fora daqui, sem `app.user_id`
 * definido, toda query devolve vazio (falha fechado).
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  // Defesa contra um id malformado chegar de lugar inesperado: `set_config`
  // é parametrizado e não é injetável, mas um id inválido deve falhar alto
  // em vez de virar uma policy que silenciosamente não casa com nada.
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error('withUser: userId inválido');
  }
  return db.transaction(async (tx) => {
    // is_local = true: reverte automaticamente no fim da transação.
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
