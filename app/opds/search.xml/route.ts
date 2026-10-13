import { NextResponse, type NextRequest } from 'next/server';
import { authenticateOpds, buildOpenSearchDescription } from '@/lib/opds';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticateOpds(req);
  if (!auth.ok) return auth.response;

  const base = new URL(req.url).origin;
  return new NextResponse(buildOpenSearchDescription(base), {
    status: 200,
    headers: {
      'Content-Type': 'application/opensearchdescription+xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
