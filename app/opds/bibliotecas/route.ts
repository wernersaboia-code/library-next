import type { NextRequest } from 'next/server';
import {
  authenticateOpds,
  buildFeed,
  navigationEntry,
  OPDS_NAVIGATION_TYPE,
  opdsXml,
} from '@/lib/opds';
import { fetchCollections } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticateOpds(req);
  if (!auth.ok) return auth.response;

  const base = new URL(req.url).origin;
  const colecoes = await fetchCollections(auth.userId);

  const body = buildFeed({
    id: `${base}/opds/bibliotecas`,
    title: 'Bibliotecas',
    self: `${base}/opds/bibliotecas`,
    start: `${base}/opds`,
    entries: colecoes.map((colecao) =>
      navigationEntry(
        colecao.name,
        `${base}/opds/biblioteca/${colecao.id}`,
        `${colecao.total} ${colecao.total === 1 ? 'livro' : 'livros'}`
      )
    ),
  });

  return opdsXml(body, OPDS_NAVIGATION_TYPE);
}
