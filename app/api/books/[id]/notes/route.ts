import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { highlights } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';

const KIND = new Set(['note', 'quote']);

function parseBookId(id: string): number | null {
  const bookId = Number(id);
  if (!Number.isInteger(bookId) || bookId <= 0) return null;
  return bookId;
}

export async function GET(
  _req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = parseBookId((await params).id);
    if (bookId === null)
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });

    const rows = await withUser(userId, (tx) =>
      tx.select().from(highlights)
        .where(eq(highlights.bookId, bookId))
        .orderBy(asc(highlights.createdAt)));

    return NextResponse.json(rows);
  } catch (err) {
    return errorResponse(err, 'Erro ao buscar as notas');
  }
}

export async function POST(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = parseBookId((await params).id);
    if (bookId === null)
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });

    const body = await req.json();

    if (!KIND.has(body.kind))
      return NextResponse.json({ error: 'kind inválido' }, { status: 400 });

    const textContent = typeof body.textContent === 'string' && body.textContent.trim()
      ? body.textContent
      : null;
    const note = typeof body.note === 'string' && body.note.trim()
      ? body.note
      : null;

    if (textContent === null && note === null)
      return NextResponse.json(
        { error: 'informe ao menos a citação ou o comentário' },
        { status: 400 }
      );

    const rows = await withUser(userId, (tx) =>
      tx.insert(highlights).values({
        userId,
        bookId,
        kind: body.kind,
        textContent,
        note,
      }).returning({ id: highlights.id }));

    return NextResponse.json(rows[0]);
  } catch (err) {
    return errorResponse(err, 'Erro ao criar a nota');
  }
}

export async function PATCH(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = parseBookId((await params).id);
    if (bookId === null)
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });

    const body = await req.json();
    if (typeof body.noteId !== 'string' || !body.noteId)
      return NextResponse.json({ error: 'noteId é obrigatório' }, { status: 400 });

    const set: Record<string, unknown> = {};
    if (body.note !== undefined) set.note = body.note;
    if (body.textContent !== undefined) set.textContent = body.textContent;

    if (Object.keys(set).length === 0)
      return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });

    set.updatedAt = new Date();

    const rows = await withUser(userId, (tx) =>
      tx.update(highlights).set(set)
        .where(and(eq(highlights.id, body.noteId), eq(highlights.bookId, bookId)))
        .returning({ id: highlights.id }));

    if (rows.length === 0)
      return NextResponse.json({ error: 'nota não encontrada' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao atualizar a nota');
  }
}

export async function DELETE(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = parseBookId((await params).id);
    if (bookId === null)
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });

    const body = await req.json();
    if (typeof body.noteId !== 'string' || !body.noteId)
      return NextResponse.json({ error: 'noteId é obrigatório' }, { status: 400 });

    const rows = await withUser(userId, (tx) =>
      tx.delete(highlights)
        .where(and(eq(highlights.id, body.noteId), eq(highlights.bookId, bookId)))
        .returning({ id: highlights.id }));

    if (rows.length === 0)
      return NextResponse.json({ error: 'nota não encontrada' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao apagar a nota');
  }
}
