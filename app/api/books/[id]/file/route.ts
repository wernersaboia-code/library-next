import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { bookFiles } from '@/lib/db/schema';
import { getSignedBookUrl } from '@/lib/storage';
import { errorResponse } from '@/lib/errors';

export async function GET(
  _req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = Number((await params).id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const rows = await withUser(userId, (tx) =>
      tx
        .select({
          storagePath: bookFiles.storagePath,
          format: bookFiles.format,
          mime: bookFiles.mime,
          hasFile: bookFiles.hasFile,
        })
        .from(bookFiles)
        .where(eq(bookFiles.bookId, bookId))
        .limit(1)
    );

    const file = rows[0];
    if (!file?.hasFile) {
      return NextResponse.json({ error: 'Arquivo ainda não carregado' }, { status: 404 });
    }

    try {
      const url = await getSignedBookUrl(file.storagePath);
      return NextResponse.json({ url, format: file.format, mime: file.mime });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/not found|does not exist|no such object/i.test(msg)) {
        // Linha no banco sem objeto no Storage (ex.: bucket recriado): trata
        // como "não carregado" em vez de 500, orientando a rodar o sync.
        return NextResponse.json(
          { error: 'Arquivo não encontrado no Storage. Rode `pnpm db:sync-files`.' },
          { status: 404 }
        );
      }
      if (/ausentes|SUPABASE_URL|SERVICE_ROLE_KEY|invalid api key|invalid compact jws/i.test(msg)) {
        // Erro de configuração do servidor: mensagem própria para o log e a
        // tela apontarem a causa, sem expor a mensagem crua do SDK.
        console.error('[file] Storage mal configurado:', msg);
        return NextResponse.json(
          { error: 'Storage não configurado no servidor (SUPABASE_URL/SERVICE_ROLE_KEY).' },
          { status: 500 }
        );
      }
      throw e;
    }
  } catch (err) {
    return errorResponse(err, 'Erro ao abrir o arquivo');
  }
}
