import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { collections, bookCollections } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';

const MAX_LOTE = 200;
const NAO_ENCONTRADA = 'Biblioteca não encontrada';

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** null quando a lista é inválida — vazia, malformada ou acima do teto. */
function parseBookIds(valor: unknown): number[] | null {
  if (!Array.isArray(valor) || valor.length === 0) return null;
  if (valor.length > MAX_LOTE) return null;
  const ids: number[] = [];
  for (const bruto of valor) {
    const n = Number(bruto);
    if (!Number.isInteger(n) || n <= 0) return null;
    ids.push(n);
  }
  return ids;
}

export async function POST(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const collectionId = parseId((await params).id);
    if (collectionId === null) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const body = await req.json();
    const bookIds = parseBookIds(body.bookIds);
    if (bookIds === null) {
      return NextResponse.json(
        { error: `Informe de 1 a ${MAX_LOTE} livros` }, { status: 400 });
    }

    const adicionados = await withUser(userId, async (tx) => {
      const [colecao] = await tx.select({ id: collections.id })
        .from(collections).where(eq(collections.id, collectionId)).limit(1);
      if (!colecao) return null;

      // onConflictDoNothing: repetir um livro já vinculado não derruba o
      // lote (AD-6). Livro de outro dono é barrado pela policy WITH CHECK
      // e simplesmente não entra — sem mensagem, para não revelar que
      // existe (AD-7).
      const inseridos = await tx.insert(bookCollections)
        .values(bookIds.map((bookId) => ({ bookId, collectionId })))
        .onConflictDoNothing()
        .returning({ bookId: bookCollections.bookId });

      return inseridos.length;
    });

    if (adicionados === null) {
      return NextResponse.json({ error: NAO_ENCONTRADA }, { status: 404 });
    }
    return NextResponse.json({ adicionados });
  } catch (err) {
    return errorResponse(err, 'Erro ao adicionar livros à biblioteca');
  }
}

export async function DELETE(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const collectionId = parseId((await params).id);
    if (collectionId === null) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const body = await req.json();
    const bookIds = parseBookIds(body.bookIds);
    if (bookIds === null) {
      return NextResponse.json(
        { error: `Informe de 1 a ${MAX_LOTE} livros` }, { status: 400 });
    }

    const removidos = await withUser(userId, async (tx) => {
      const [colecao] = await tx.select({ id: collections.id })
        .from(collections).where(eq(collections.id, collectionId)).limit(1);
      if (!colecao) return null;

      const apagados = await tx.delete(bookCollections)
        .where(and(
          eq(bookCollections.collectionId, collectionId),
          inArray(bookCollections.bookId, bookIds)
        ))
        .returning({ bookId: bookCollections.bookId });

      return apagados.length;
    });

    if (removidos === null) {
      return NextResponse.json({ error: NAO_ENCONTRADA }, { status: 404 });
    }
    return NextResponse.json({ removidos });
  } catch (err) {
    return errorResponse(err, 'Erro ao remover livros da biblioteca');
  }
}
