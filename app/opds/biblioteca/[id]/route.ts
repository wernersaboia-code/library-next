import { NextResponse, type NextRequest } from 'next/server';
import { acquisitionFeed, authenticateOpds } from '@/lib/opds';
import { fetchCollection } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateOpds(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const collectionId = Number(id);
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return new NextResponse('Biblioteca inválida', { status: 404 });
  }

  const colecao = await fetchCollection(auth.userId, collectionId);
  if (!colecao) {
    return new NextResponse('Biblioteca não encontrada', { status: 404 });
  }

  const base = new URL(req.url).origin;
  return acquisitionFeed({
    req,
    base,
    userId: auth.userId,
    path: `/opds/biblioteca/${collectionId}`,
    title: colecao.name,
    filters: { collectionId },
  });
}
