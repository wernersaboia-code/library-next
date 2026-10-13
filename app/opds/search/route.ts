import type { NextRequest } from 'next/server';
import { acquisitionFeed, authenticateOpds } from '@/lib/opds';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticateOpds(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const base = url.origin;
  const q = (url.searchParams.get('q') ?? '').trim();

  return acquisitionFeed({
    req,
    base,
    userId: auth.userId,
    path: '/opds/search',
    title: q ? `Busca: ${q}` : 'Busca',
    filters: { owned: true, search: q || undefined },
  });
}
