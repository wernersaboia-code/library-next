import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { bookFiles, books } from '@/lib/db/schema';
import {
  BOOK_FILES_BUCKET,
  bookFilePath,
  createSignedBookUpload,
  getSignedBookUrl,
  tamanhoDoObjeto,
} from '@/lib/storage';
import {
  TAMANHO_MAXIMO_PADRAO,
  mimeDoFormato,
  validarArquivo,
  type FormatoDoLivro,
} from '@/lib/arquivo-do-livro';
import { errorResponse } from '@/lib/errors';

// Mesmo teto por arquivo do comando local (`db:sync-files`), para o celular não
// conseguir subir o que o computador recusaria.
const MAX_FILE_BYTES = Number(process.env.BOOK_FILE_MAX_BYTES ?? TAMANHO_MAXIMO_PADRAO);

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

/**
 * O livro é do dono? Com a RLS inerte em produção (a aplicação conecta como
 * `postgres`, que a ignora), este filtro não é redundante: é o que impede um
 * envio de arquivo cair no livro de outra pessoa.
 */
async function livroDoDono(userId: string, bookId: number): Promise<boolean> {
  const linhas = await withUser(userId, (tx) =>
    tx
      .select({ id: books.id })
      .from(books)
      .where(and(eq(books.id, bookId), eq(books.userId, userId)))
      .limit(1)
  );
  return linhas.length > 0;
}

/**
 * Primeiro passo do envio pelo aparelho: confere o arquivo escolhido e devolve
 * uma URL assinada para o navegador subir os bytes direto ao Storage (um
 * EPUB/PDF grande não passa pelo corpo de uma função da Vercel).
 */
export async function POST(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = Number((await params).id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as
      | { nome?: unknown; tamanho?: unknown }
      | null;
    const escolha = validarArquivo(
      typeof body?.nome === 'string' ? body.nome : '',
      Number(body?.tamanho),
      MAX_FILE_BYTES
    );
    if (!escolha.ok) {
      return NextResponse.json({ error: escolha.erro }, { status: 400 });
    }

    if (!(await livroDoDono(userId, bookId))) {
      return NextResponse.json({ error: 'Livro não encontrado' }, { status: 404 });
    }

    const { signedUrl } = await createSignedBookUpload(userId, bookId, escolha.formato);
    return NextResponse.json({ signedUrl, formato: escolha.formato, mime: escolha.mime });
  } catch (err) {
    return errorResponse(err, 'Erro ao preparar o envio do arquivo');
  }
}

/**
 * Segundo passo: o navegador já subiu o arquivo, e aqui o servidor confere no
 * Storage (tamanho medido lá, não o que o cliente disse) e registra o livro
 * como pronto para leitura — igual ao que `db:sync-files` faz pelo computador.
 */
export async function PUT(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = Number((await params).id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as
      | { formato?: unknown; sha256?: unknown }
      | null;
    const formato: FormatoDoLivro | null =
      body?.formato === 'epub' ? 'epub' : body?.formato === 'pdf' ? 'pdf' : null;
    if (!formato) {
      return NextResponse.json({ error: 'Formato inválido' }, { status: 400 });
    }

    if (!(await livroDoDono(userId, bookId))) {
      return NextResponse.json({ error: 'Livro não encontrado' }, { status: 404 });
    }

    const path = bookFilePath(userId, bookId, formato);
    const tamanho = await tamanhoDoObjeto(BOOK_FILES_BUCKET, path);
    if (!tamanho) {
      return NextResponse.json(
        { error: 'O arquivo não chegou ao Storage. Tente enviar de novo.' },
        { status: 409 }
      );
    }
    if (tamanho > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'O arquivo enviado passou do limite.' },
        { status: 400 }
      );
    }

    const mime = mimeDoFormato(formato);
    const sha256 =
      typeof body?.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(body.sha256)
        ? body.sha256.toLowerCase()
        : null;

    await withUser(userId, (tx) =>
      tx
        .insert(bookFiles)
        .values({
          userId,
          bookId,
          format: formato,
          storagePath: path,
          mime,
          size: tamanho,
          sha256,
          hasFile: true,
        })
        .onConflictDoUpdate({
          target: bookFiles.bookId,
          set: {
            format: formato,
            storagePath: path,
            mime,
            size: tamanho,
            sha256,
            hasFile: true,
            updatedAt: new Date(),
          },
        })
    );
    await withUser(userId, (tx) =>
      tx
        .update(books)
        .set({ has_file: true })
        .where(and(eq(books.id, bookId), eq(books.userId, userId)))
    );

    return NextResponse.json({ ok: true, formato, size: tamanho });
  } catch (err) {
    return errorResponse(err, 'Erro ao registrar o arquivo enviado');
  }
}
