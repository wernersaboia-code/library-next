import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { driveFiles } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const bookId = searchParams.get('bookId');

  if (!bookId)
    return NextResponse.json({ error: 'bookId é obrigatório' }, { status: 400 });

  // Busca o fileId do Drive associado ao livro
  const driveFile = await db
    .select({ fileId: driveFiles.fileId })
    .from(driveFiles)
    .where(eq(driveFiles.bookId, parseInt(bookId)))
    .limit(1)
    .then((r) => r[0]);

  if (!driveFile)
    return NextResponse.json({ error: 'Drive file não encontrado' }, { status: 404 });

  const url = `https://www.googleapis.com/drive/v3/files/${driveFile.fileId}?alt=media`;

  try {
    const driveRes = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });

    if (!driveRes.ok)
      return NextResponse.json({ error: 'Drive API error', status: driveRes.status }, { status: driveRes.status });

    const headers = new Headers();
    headers.set('Content-Type', driveRes.headers.get('content-type') || 'application/epub+zip');
    headers.set('Content-Length', driveRes.headers.get('content-length') || '');
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('Access-Control-Allow-Origin', '*');

    return new NextResponse(driveRes.body, { status: 200, headers });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao ler arquivo do Drive', details: String(err) }, { status: 500 });
  }
}
