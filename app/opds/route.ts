import type { NextRequest } from 'next/server';
import {
  authenticateOpds,
  buildFeed,
  navigationEntry,
  OPDS_NAVIGATION_TYPE,
  opdsXml,
} from '@/lib/opds';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticateOpds(req);
  if (!auth.ok) return auth.response;

  const base = new URL(req.url).origin;
  const body = buildFeed({
    id: `${base}/opds`,
    title: 'Book Inventory',
    self: `${base}/opds`,
    start: `${base}/opds`,
    search: `${base}/opds/search.xml`,
    entries: [
      navigationEntry(
        'Acervo',
        `${base}/opds/acervo`,
        'Todos os livros do acervo.'
      ),
      navigationEntry(
        'Lendo agora',
        `${base}/opds/lendo`,
        'Livros em leitura.'
      ),
      navigationEntry(
        'Próximos',
        `${base}/opds/proximos`,
        'A fila do que ler em seguida.'
      ),
      navigationEntry(
        'Favoritos',
        `${base}/opds/favoritos`,
        'Os lidos que superaram as expectativas.'
      ),
      navigationEntry(
        'Bibliotecas',
        `${base}/opds/bibliotecas`,
        'Coleções que você montou.',
        OPDS_NAVIGATION_TYPE
      ),
    ],
  });

  return opdsXml(body, OPDS_NAVIGATION_TYPE);
}
