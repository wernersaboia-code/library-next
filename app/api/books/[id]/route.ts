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

/** O que a transação decidiu — distingue erro de regra de erro de corpo. */
type Resultado =
  | { kind: 'ok' }
  | { kind: 'nao-encontrado' }
  | { kind: 'conflito'; mensagem: string };

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

    // ─── Validação do corpo ───────────────────────────────────
    // Só o que dá para julgar sem conhecer o livro. Regras que dependem do
    // estado atual ficam na transação, abaixo.
    if (body.readStatus !== undefined) {
      if (!STATUS.has(body.readStatus))
        return NextResponse.json({ error: 'status inválido' }, { status: 400 });
      set.read_status = body.readStatus;
    }
    if (body.myRating !== undefined && body.myRating !== null) {
      const r = Number(body.myRating);
      // Múltiplos de 0,5 entre 0,5 e 5 (AD-1). `r * 2` inteiro é o teste do
      // meio passo; 0,5 e seus múltiplos são exatos em binário.
      if (!Number.isFinite(r) || r < 0.5 || r > 5 || !Number.isInteger(r * 2))
        return NextResponse.json(
          { error: 'avaliação deve ir de 0,5 a 5, de meia em meia' },
          { status: 400 });
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
    }

    if (body.dnfReason !== undefined) {
      set.dnf_reason = typeof body.dnfReason === 'string' && body.dnfReason.trim()
        ? body.dnfReason.trim()
        : null;
    }

    // Título original vale para qualquer livro — inclusive os do Calibre:
    // a coluna fica fora de CatalogMetadata, então o sync nunca a toca.
    if (body.originalTitle !== undefined) {
      set.original_title = typeof body.originalTitle === 'string'
        && body.originalTitle.trim()
        ? body.originalTitle.trim()
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

    if (Object.keys(set).length === 0 && body.nextUp === undefined
        && body.favorite === undefined)
      return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });

    // ─── Regras que dependem do estado atual ──────────────────
    // Lidas dentro da transação, e não recebidas do cliente: a tela pode
    // estar mostrando um estado velho — foi exatamente assim que o abandono
    // deixava de pegar — e decidir escrita pelo que o navegador acha que
    // sabe volta a errar sob rede lenta.
    const resultado = await withUser(userId, async (tx): Promise<Resultado> => {
      const [atual] = await tx
        .select({
          read_status: books.read_status,
          owned: books.owned,
        })
        .from(books)
        .where(eq(books.id, bookId))
        .limit(1);

      if (!atual) return { kind: 'nao-encontrado' };

      // O status que valerá ao fim deste pedido: o enviado, se houver, ou o
      // que já estava gravado.
      const statusFinal = (set.read_status as string | undefined)
        ?? atual.read_status;

      // Progresso entre 1 e 99 só promove livro que ainda não foi começado
      // (AD-3). Abandonado e lido mantêm o status. 0 não muda nada — é
      // "comecei e não avancei" — e 100 espera o clique de "Terminei hoje".
      const p = set.progress_percent as number | undefined;
      if (p !== undefined && p >= 1 && p <= 99 && statusFinal === 'não lido') {
        set.read_status = 'lendo';
      }

      if (body.nextUp !== undefined) {
        if (body.nextUp === true && !atual.owned) {
          return {
            kind: 'conflito',
            mensagem: 'Só dá para pôr na fila um livro que você tem. '
              + 'Este ainda está em Quero ter.',
          };
        }
        set.next_up = body.nextUp === true;
      }

      if (body.favorite !== undefined) {
        if (body.favorite === true && statusFinal !== 'lido') {
          return {
            kind: 'conflito',
            mensagem: 'Favorito é para livro já lido. Marque como lido primeiro.',
          };
        }
        set.favorite = body.favorite === true;
      }

      // Virou lido: saiu da fila (AD-6). Não mexemos se o próprio pedido
      // disse o que fazer com a marca — a ordem explícita do dono vence.
      if (set.read_status === 'lido' && body.nextUp === undefined) {
        set.next_up = false;
      }

      await tx.update(books).set(set).where(eq(books.id, bookId));
      return { kind: 'ok' };
    });

    if (resultado.kind === 'nao-encontrado')
      return NextResponse.json({ error: 'livro não encontrado' }, { status: 404 });
    if (resultado.kind === 'conflito')
      return NextResponse.json({ error: resultado.mensagem }, { status: 409 });
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
