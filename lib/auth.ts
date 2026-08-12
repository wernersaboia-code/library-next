import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { getToken } from 'next-auth/jwt';
import { cookies, headers } from 'next/headers';
import { getOrCreateAppUserId } from '@/lib/db/users';
import { isEmailAllowed, refreshGoogleToken, DriveAuthError } from './auth-tokens';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    userId?: string;
    error?: 'RefreshFailed';
  }
}

declare module 'next-auth' {
  interface Session {
    userId?: string;
    error?: 'RefreshFailed';
    // accessToken/refreshToken permanecem AUSENTES de propósito.
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope:
            'openid email profile https://www.googleapis.com/auth/drive.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      return isEmailAllowed(profile?.email);
    },

    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600_000;
        token.error = undefined;

        const email = profile?.email ?? token.email;
        if (email) {
          token.userId = await getOrCreateAppUserId(
            email,
            profile?.name,
            typeof profile?.picture === 'string' ? profile.picture : undefined
          );
        }
        return token;
      }

      if (token.expiresAt && Date.now() < token.expiresAt - REFRESH_MARGIN_MS) {
        return token;
      }

      if (!token.refreshToken) {
        token.error = 'RefreshFailed';
        return token;
      }

      try {
        const r = await refreshGoogleToken(token.refreshToken);
        token.accessToken = r.accessToken;
        token.expiresAt = r.expiresAt;
        if (r.refreshToken) token.refreshToken = r.refreshToken;
        token.error = undefined;
      } catch {
        token.error = 'RefreshFailed';
      }
      return token;
    },

    async session({ session, token }) {
      // NextAuth 5.0.0-beta.31 tipa o parâmetro `session` como uma
      // intersecção entre a forma de estratégia "database" (que inclui
      // `AdapterSession.userId: string`, obrigatório) e a forma "jwt"
      // (nosso `Session.userId?: string`). O TypeScript colapsa a
      // propriedade para `string` obrigatório mesmo em runtime JWT, onde
      // ela pode legitimamente estar ausente — daí o `as string` abaixo.
      session.userId = token.userId as string;
      session.error = token.error;
      return session; // tokens do Google NÃO entram aqui
    },
  },
  pages: { signIn: '/login' },
});

async function readToken() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new DriveAuthError('AUTH_SECRET não configurado');
  const req = {
    headers: await headers(),
    cookies: await cookies(),
  } as never;
  return getToken({
    req,
    secret,
    secureCookie: process.env.NODE_ENV === 'production',
  });
}

export async function getDriveToken(): Promise<string> {
  const token = await readToken();
  if (!token?.accessToken || token.error) throw new DriveAuthError();
  return token.accessToken as string;
}

export async function getCurrentUserId(): Promise<string> {
  const token = await readToken();
  if (!token?.userId) throw new DriveAuthError('Sessão inválida');
  return token.userId as string;
}

export { DriveAuthError };
