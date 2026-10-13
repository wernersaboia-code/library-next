import { NextResponse, type NextRequest } from 'next/server';
import { authenticateOpds, fetchBookFile } from '@/lib/opds';
import { getSignedBookUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateOpds(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const bookId = Number(id);
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return new NextResponse('Livro inválido', { status: 400 });
  }

  const arquivo = await fetchBookFile(auth.userId, bookId);
  if (!arquivo) {
    return new NextResponse('Arquivo não disponível', { status: 404 });
  }

  // O arquivo vive num bucket privado: assinamos uma URL de curta duração e
  // redirecionamos. Assim o download não passa pelo corpo de uma função da
  // Vercel (limite de ~4,5 MB) e o cliente busca direto no Storage.
  const signedUrl = await getSignedBookUrl(arquivo.storagePath, 3600);
  return NextResponse.redirect(signedUrl, 302);
}
