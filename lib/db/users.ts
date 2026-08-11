// lib/db/users.ts
//
// Resolve o app_users.id a partir do email da sessão NextAuth. A Task 3
// introduziu `app_users` sem migrar nenhum fluxo de autenticação — este
// helper é a ponte mínima para as rotas existentes continuarem
// compilando e funcionando (insert/select) até que a Task 4/5 traga RLS
// e wiring de auth mais completos.
import { eq } from 'drizzle-orm';
import { db } from './drizzle';
import { appUsers } from './schema';

export async function getOrCreateAppUserId(
  email: string,
  name?: string | null,
  image?: string | null
): Promise<string> {
  const existing = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.email, email))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(appUsers)
    .values({ email, name: name ?? null, image: image ?? null })
    .onConflictDoNothing({ target: appUsers.email })
    .returning({ id: appUsers.id });

  if (created) return created.id;

  // Corrida: outra requisição criou o usuário entre o select e o insert.
  const [row] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.email, email))
    .limit(1);

  return row.id;
}
