import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import {
  applyCoverFromBuffer, fetchCoverFromProvider, isCoverProvider,
  MAX_COVER_BYTES, TIPOS_ACEITOS, type CoverProvider,
} from '@/lib/covers';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = Number((await params).id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    // O filtro explícito também protege conexões que ainda ignoram a RLS.
    const source = await withUser(userId, async (tx) => {
      const [livro] = await tx.select({ source: books.source })
        .from(books).where(and(eq(books.id, bookId), eq(books.userId, userId))).limit(1);
      return livro?.source ?? null;
    });

    if (source === null) {
      return NextResponse.json({ error: 'Livro não encontrado' }, { status: 404 });
    }
    if (source !== 'manual') {
      return NextResponse.json({
        error: 'Este livro veio do Calibre. Troque a capa no Calibre e sincronize.',
      }, { status: 409 });
    }

    const rate = checkRateLimit(`cover-upload:${userId}`, 10, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Muitas trocas de capa em pouco tempo. Tente novamente em instantes.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
      );
    }

    const contentType = req.headers.get('content-type') ?? '';

    // Caminho 1: capa de uma fonte externa, por referência (provedor + id).
    // O cliente nunca manda a URL — o host é fixo por provedor (AD-7).
    if (contentType.includes('application/json')) {
      const body = await req.json();

      let provider: CoverProvider = 'openlibrary';
      let id: string | null = null;

      if (body?.ref && isCoverProvider(body.ref.provider) && typeof body.ref.id === 'string') {
        provider = body.ref.provider;
        id = body.ref.id;
      } else if (body.coverId !== undefined) {
        const coverId = Number(body.coverId);
        if (!Number.isInteger(coverId) || coverId <= 0) {
          return NextResponse.json(
            { error: 'coverId inválido' }, { status: 400 });
        }
        id = String(coverId);
      }

      // id restrito a caracteres de identificador: evita caminho/consulta
      // maliciosa montada a partir da referência.
      if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
        return NextResponse.json(
          { error: 'Referência de capa inválida' }, { status: 400 });
      }

      const buf = await fetchCoverFromProvider(provider, id);
      const imageUrl = await applyCoverFromBuffer(userId, bookId, buf);
      return NextResponse.json({ success: true, imageUrl });
    }

    // Caminho 2: arquivo enviado pelo usuário.
    const form = await req.formData();
    const arquivo = form.get('file');
    if (!(arquivo instanceof File)) {
      return NextResponse.json(
        { error: 'Envie um arquivo de imagem' }, { status: 400 });
    }
    if (!TIPOS_ACEITOS.includes(arquivo.type as (typeof TIPOS_ACEITOS)[number])) {
      return NextResponse.json(
        { error: `Tipo não suportado: ${arquivo.type}. Use JPEG, PNG ou WebP.` },
        { status: 400 });
    }
    if (arquivo.size > MAX_COVER_BYTES) {
      return NextResponse.json(
        { error: 'A imagem deve ter no máximo 5MB' }, { status: 400 });
    }

    const original = Buffer.from(await arquivo.arrayBuffer());
    // A normalização (resize + JPEG) fica em applyCoverFromBuffer: o Storage
    // recebe sempre uma capa leve, qualquer que seja o tipo enviado.
    const imageUrl = await applyCoverFromBuffer(userId, bookId, original);
    return NextResponse.json({ success: true, imageUrl });
  } catch (err) {
    return errorResponse(err, 'Erro ao aplicar a capa');
  }
}
