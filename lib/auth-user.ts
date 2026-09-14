import 'server-only';
import { cache } from 'react';
import { db } from '@/lib/db/drizzle';
import { appUsers } from '@/lib/db/schema';
import { createClient } from '@/lib/supabase/server';
import { AuthError } from './auth-error';

export { AuthError } from './auth-error';

export async function ensureAppUser(id: string, email: string): Promise<void> {
  // Normaliza para minúsculas: o import do Calibre (resolveUserId) casa por
  // e-mail em minúsculas; gravar aqui na mesma forma evita identidade paralela.
  await db.insert(appUsers).values({ id, email: email.trim().toLowerCase() })
    .onConflictDoNothing({ target: appUsers.id });
}

// `cache` deduplica em escopo de request: layout e página chamam
// getCurrentUser no mesmo request, e sem isso cada chamada abria um cliente
// novo e fazia uma ida ao Supabase Auth. O cache é por-request — não vaza
// usuário entre requests.
//
// `getUser` em vez de `getSession`: o `getSession` devolve o usuário do
// cookie SEM verificar assinatura (o supabase-js até emite um aviso de
// insegurança ao acessá-lo), e as rotas de API não passam mais pelo
// middleware — então nada validava o token nelas. `getUser` autentica o
// access token contra o Supabase Auth; a ida à rede é 1x por request (o
// `cache` acima deduplica), o que é aceitável para este app.
export const getCurrentUser = cache(
  async (): Promise<{ id: string; email: string }> => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    const user = data.user;
    if (error || !user?.email) throw new AuthError();
    return { id: user.id, email: user.email };
  }
);

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
