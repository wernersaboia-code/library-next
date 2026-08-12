import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDriveToken, getCurrentUserId } from '@/lib/auth';
import { withUser } from '@/lib/db/with-user';
import { driveFiles } from '@/lib/db/schema';
import { createSignedUrl } from '@/lib/storage';
import { fetchDriveFileStream } from '@/lib/drive';
import { errorResponse } from '@/lib/errors';

export async function GET(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const bookId = Number(new URL(req.url).searchParams.get('bookId'));

    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ error: 'bookId inválido' }, { status: 400 });
    }

    const [file] = await withUser(userId, (tx) =>
      tx.select({
        fileId: driveFiles.fileId,
        mimeType: driveFiles.mimeType,
        cachedPath: driveFiles.cachedPath,
      })
        .from(driveFiles)
        .where(eq(driveFiles.bookId, bookId))
        .limit(1)
    );

    // RLS já filtrou por dono: ausência significa "não existe para você".
    if (!file) {
      return NextResponse.json(
        { error: 'Arquivo não encontrado' }, { status: 404 }
      );
    }

    // Arquivo já cacheado no Storage: devolve uma signed URL e não toca no
    // Drive. Se a assinatura falhar (Storage indisponível), não caímos de
    // volta para o proxy do Drive — o arquivo pode nem estar mais lá — e o
    // catch geral abaixo devolve um erro genérico.
    if (file.cachedPath) {
      return NextResponse.redirect(await createSignedUrl(file.cachedPath), 302);
    }

    const range = req.headers.get('range');
    const upstream = await fetchDriveFileStream(
      await getDriveToken(), file.fileId, range
    );

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: 'Falha ao ler o arquivo no Drive' },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') ?? file.mimeType);
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('Accept-Ranges', 'bytes');
    for (const h of ['content-length', 'content-range']) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    // Sem Access-Control-Allow-Origin: rota autenticada por cookie.

    return new NextResponse(upstream.body, {
      status: upstream.status, headers,
    });
  } catch (err) {
    return errorResponse(err, 'Erro ao abrir o livro');
  }
}
