import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

// Augmentações de tipo para armazenar tokens do Google Drive na session/JWT
import type {} from 'next-auth/jwt';

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
  }
}

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
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
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.refreshToken = token.refreshToken;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
