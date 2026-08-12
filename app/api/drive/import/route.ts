import { NextResponse } from 'next/server';
import { getDriveToken, getCurrentUserId } from '@/lib/auth';
import { importBook, AlreadyImportedError } from '@/lib/import-book';
import { errorResponse } from '@/lib/errors';

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const accessToken = await getDriveToken();
    const { fileId, fileName, mimeType, size } = await req.json();

    if (!fileId || !mimeType) {
      return NextResponse.json(
        { error: 'fileId e mimeType são obrigatórios' }, { status: 400 }
      );
    }

    const result = await importBook({
      userId, accessToken, fileId,
      fileName: fileName ?? '',
      mimeType,
      sizeBytes: size ? Number(size) : undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof AlreadyImportedError) {
      return NextResponse.json(
        { error: 'Livro já importado', bookId: err.bookId }, { status: 409 }
      );
    }
    return errorResponse(err, 'Erro ao importar o livro');
  }
}
