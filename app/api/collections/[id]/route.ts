import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { collections } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import {
  ehNomeDuplicado, nomeValido, NOME_DUPLICADO, NOME_VAZIO,
} from '@/lib/collections-input';

const NAO_ENCONTRADA = 'Biblioteca não encontrada';

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const body = await req.json();
    const name = nomeValido(body.name);
    if (name === null) {
      return NextResponse.json({ error: NOME_VAZIO }, { status: 400 });
    }

    // A RLS escopa por dono: biblioteca de outro usuário não é atingida e
    // volta como não encontrada.
    const rows = await withUser(userId, (tx) =>
      tx.update(collections).set({ name })
        .where(eq(collections.id, id))
        .returning({ id: collections.id }));

    if (rows.length === 0) {
      return NextResponse.json({ error: NAO_ENCONTRADA }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (ehNomeDuplicado(err)) {
      return NextResponse.json({ error: NOME_DUPLICADO }, { status: 409 });
    }
    return errorResponse(err, 'Erro ao renomear a biblioteca');
  }
}

export async function DELETE(
  _req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    // Os vínculos caem por cascade; os livros permanecem no acervo.
    const rows = await withUser(userId, (tx) =>
      tx.delete(collections).where(eq(collections.id, id))
        .returning({ id: collections.id }));

    if (rows.length === 0) {
      return NextResponse.json({ error: NAO_ENCONTRADA }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao apagar a biblioteca');
  }
}
