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
// `getSession` em vez de `getUser`: é local (lê o cookie, sem rede). O
// middleware já validou e, se preciso, renovou o token com `getUser()` no
// início de todo request (quem não tem sessão nem chega aqui — cai no
// redirect para /login). Só usamos id e e-mail, que são estáveis no cookie;
// renovação de token continua sendo responsabilidade do middleware.
export const getCurrentUser = cache(
  async (): Promise<{ id: string; email: string }> => {
    const supabase = await createClient();
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.user?.email) throw new AuthError();
    return { id: session.user.id, email: session.user.email };
  }
);

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
