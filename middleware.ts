import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (req.auth.error === 'RefreshFailed') {
    const url = new URL('/login', req.url);
    url.searchParams.set('erro', 'drive');
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)'],
};
