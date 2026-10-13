import type { NextRequest } from 'next/server';
import { acquisitionFeed, authenticateOpds } from '@/lib/opds';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticateOpds(req);
  if (!auth.ok) return auth.response;

  const base = new URL(req.url).origin;
  return acquisitionFeed({
    req,
    base,
    userId: auth.userId,
    path: '/opds/lendo',
    title: 'Lendo agora',
    filters: { readStatus: 'lendo' },
  });
}
