import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';

const STATUS = new Set(['lido', 'lendo', 'não lido', 'abandonado']);

/** Data de hoje em ISO (só o dia) — a coluna date_finished é `date`. */
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

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

    if (body.progressPercent !== undefined && body.progressPercent !== null) {
      const p = Number(body.progressPercent);
      if (!Number.isInteger(p) || p < 0 || p > 100) {
        return NextResponse.json(
          { error: 'O progresso deve ser um inteiro entre 0 e 100' },
          { status: 400 });
      }
      set.progress_percent = p;
      set.progress_updated_at = new Date();
      // Progresso entre 1 e 99 significa leitura em andamento (AD-6). 0 não
      // muda nada — é "comecei e não avancei" — e 100 espera o clique
      // consciente de "Terminei hoje".
      if (p >= 1 && p <= 99) set.read_status = 'lendo';
    }

    if (body.dnfReason !== undefined) {
      set.dnf_reason = typeof body.dnfReason === 'string' && body.dnfReason.trim()
        ? body.dnfReason.trim()
        : null;
    }

    // "Terminei hoje": a única ação que grava data de conclusão (AD-1).
    // Vem depois do progresso de propósito, para vencer qualquer percentual
    // enviado no mesmo pedido.
    if (body.finishedToday === true) {
      set.read_status = 'lido';
      set.progress_percent = 100;
      set.date_finished = hojeISO();
    }

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

export async function DELETE(
  _req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = Number((await params).id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const resultado = await withUser(userId, async (tx) => {
      const [livro] = await tx.select({ source: books.source })
        .from(books).where(eq(books.id, bookId)).limit(1);
      if (!livro) return 'nao-encontrado' as const;
      if (livro.source !== 'manual') return 'do-calibre' as const;
      await tx.delete(books).where(eq(books.id, bookId));
      return 'apagado' as const;
    });

    if (resultado === 'nao-encontrado') {
      return NextResponse.json({ error: 'Livro não encontrado' }, { status: 404 });
    }
    if (resultado === 'do-calibre') {
      return NextResponse.json({
        error: 'Este livro veio do Calibre. Remova-o da biblioteca do Calibre e sincronize.',
      }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao remover o livro');
  }
}
