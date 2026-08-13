import { getCurrentUserId } from '@/lib/auth';
import { withUser } from '@/lib/db/with-user';
import { highlights, type Locator } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

function toLocator(cfi?: string, page?: number): Locator {
  if (cfi) return { kind: 'epub', cfi };
  if (typeof page === 'number') return { kind: 'pdf', page };
  return {};
}

function fromLocator(locator: Locator): { cfi: string | null; page: number | null } {
  if (locator.kind === 'epub') return { cfi: locator.cfi, page: null };
  if (locator.kind === 'pdf') return { cfi: null, page: locator.page };
  return { cfi: null, page: null };
}

export async function GET(req: Request) {
  try {
    const userId = await getCurrentUserId();

    const { searchParams } = new URL(req.url);
    const bookId = searchParams.get('bookId');
    if (!bookId)
      return NextResponse.json({ error: 'bookId obrigatório' }, { status: 400 });

    // RLS escopa por dono: só retorna destaques do próprio usuário.
    const list = await withUser(userId, (tx) =>
      tx
        .select()
        .from(highlights)
        .where(eq(highlights.bookId, parseInt(bookId)))
        .orderBy(highlights.createdAt)
    );

    return NextResponse.json(
      list.map((h) => ({
        id: h.id,
        bookId: h.bookId,
        type: h.kind,
        ...fromLocator(h.locator),
        textContent: h.textContent,
        note: h.note,
        color: h.color,
        createdAt: h.createdAt,
      }))
    );
  } catch (err) {
    return errorResponse(err, 'Erro ao listar destaques');
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();

    const { bookId, type, cfi, page, textContent, note, color } = await req.json();

    // Insere sob RLS: o WITH CHECK garante que userId é o próprio usuário.
    const [ann] = await withUser(userId, (tx) =>
      tx
        .insert(highlights)
        .values({
          userId,
          bookId,
          kind: type,
          textContent,
          note,
          color,
          locator: toLocator(cfi, page),
        })
        .returning()
    );

    return NextResponse.json({
      id: ann.id,
      bookId: ann.bookId,
      type: ann.kind,
      ...fromLocator(ann.locator),
      textContent: ann.textContent,
      note: ann.note,
      color: ann.color,
      createdAt: ann.createdAt,
    });
  } catch (err) {
    return errorResponse(err, 'Erro ao criar destaque');
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await getCurrentUserId();

    const { id } = await req.json();
    if (!id)
      return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    // DELETE por id sob RLS: a policy filtra pelo dono, então só apaga a linha
    // do próprio usuário — é isso que fecha o IDOR.
    await withUser(userId, (tx) =>
      tx.delete(highlights).where(eq(highlights.id, id))
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao remover destaque');
  }
}
