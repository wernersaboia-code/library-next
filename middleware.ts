import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Teto para a validação do token no Supabase Auth. O limite do edge da Vercel
// é 25s; sem esta corrida, um Supabase lento/indisponível fazia o middleware
// estourar com MIDDLEWARE_INVOCATION_TIMEOUT e derrubava o site inteiro.
const AUTH_TIMEOUT_MS = 5000;

const LOGIN_URL = '/login';

// O cookie de sessão do @supabase/ssr chama-se `sb-<ref>-auth-token`
// (eventualmente fatiado em `...-auth-token.0`, `.1`, ...). Sem cookie não há
// sessão para validar: evita uma ida à rede em todo acesso anônimo.
function temCookieDeSessao(req: NextRequest): boolean {
  return req.cookies.getAll().some(
    (c) => c.name.startsWith('sb-') && c.name.includes('-auth-token')
  );
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  if (!temCookieDeSessao(req)) {
    return NextResponse.redirect(new URL(LOGIN_URL, req.url));
  }

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (toSet) => toSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)),
        },
      }
    );

    const resultado = await Promise.race([
      supabase.auth.getUser(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), AUTH_TIMEOUT_MS)),
    ]);

    if (!resultado?.data.user) {
      return NextResponse.redirect(new URL(LOGIN_URL, req.url));
    }
  } catch {
    // Supabase fora do ar ou lento: falha fechado (manda para o login) em vez
    // de travar o request. O token é revalidado no próximo acesso.
    return NextResponse.redirect(new URL(LOGIN_URL, req.url));
  }

  return res;
}

export const config = {
  // Fora do middleware: login, internos do Next, arquivos com extensão e as
  // rotas de API (que respondem 401 via getCurrentUser, sem redirect HTML).
  matcher: ['/((?!api|login|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
