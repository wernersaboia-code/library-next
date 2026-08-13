import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';

const STATUS = new Set(['lido', 'lendo', 'não lido']);

export async function PATCH(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = Number((await params).id);
    if (!Number.isInteger(bookId) || bookId <= 0)
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });

    const body = await req.json();
    const set: Record<string, unknown> = {};

    if (body.readStatus !== undefined) {
      if (!STATUS.has(body.readStatus))
        return NextResponse.json({ error: 'status inválido' }, { status: 400 });
      set.read_status = body.readStatus;
    }
    if (body.myRating !== undefined && body.myRating !== null) {
      const r = Number(body.myRating);
      if (!Number.isInteger(r) || r < 1 || r > 5)
        return NextResponse.json({ error: 'avaliação deve ser 1..5' }, { status: 400 });
      set.my_rating = r;
    }
    if (body.myRating === null) set.my_rating = null;
    if (body.dateStarted !== undefined) set.date_started = body.dateStarted || null;
    if (body.dateFinished !== undefined) set.date_finished = body.dateFinished || null;

    if (Object.keys(set).length === 0)
      return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });

    const rows = await withUser(userId, (tx) =>
      tx.update(books).set(set).where(eq(books.id, bookId)).returning({ id: books.id }));

    if (rows.length === 0)
      return NextResponse.json({ error: 'livro não encontrado' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao atualizar o livro');
  }
}
