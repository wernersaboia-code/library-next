import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import {
  applyCoverFromBuffer, fetchOpenLibraryCover,
  MAX_COVER_BYTES, TIPOS_ACEITOS,
} from '@/lib/covers';

export async function POST(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = Number((await params).id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    // O RLS escopa por dono: um livro de outro usuário volta como não encontrado.
    const source = await withUser(userId, async (tx) => {
      const [livro] = await tx.select({ source: books.source })
        .from(books).where(eq(books.id, bookId)).limit(1);
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

    const contentType = req.headers.get('content-type') ?? '';

    // Caminho 1: capa da Open Library, por id numérico (AD-7).
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const coverId = Number(body.coverId);
      // Só o id numérico é aceito. Uma URL enviada pelo cliente (coverUrl)
      // é ignorada de propósito: baixá-la seria SSRF.
      if (!Number.isInteger(coverId) || coverId <= 0) {
        return NextResponse.json(
          { error: 'coverId inválido' }, { status: 400 });
      }
      const buf = await fetchOpenLibraryCover(coverId);
      const imageUrl = await applyCoverFromBuffer(userId, bookId, buf, 'jpg');
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
    // webp é convertido para jpeg: a allowlist do Storage só aceita png/jpg.
    const { buf, ext } = arquivo.type === 'image/webp'
      ? { buf: await sharp(original).jpeg({ quality: 88 }).toBuffer(), ext: 'jpg' as const }
      : { buf: original, ext: arquivo.type === 'image/png' ? 'png' as const : 'jpg' as const };

    const imageUrl = await applyCoverFromBuffer(userId, bookId, buf, ext);
    return NextResponse.json({ success: true, imageUrl });
  } catch (err) {
    return errorResponse(err, 'Erro ao aplicar a capa');
  }
}
