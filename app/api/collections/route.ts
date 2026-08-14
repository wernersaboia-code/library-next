import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { collections } from '@/lib/db/schema';
import { fetchCollections } from '@/lib/db/collections';
import { errorResponse } from '@/lib/errors';
import {
  ehNomeDuplicado, nomeValido, NOME_DUPLICADO, NOME_VAZIO,
} from '@/lib/collections-input';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const colecoes = await fetchCollections(userId);
    return NextResponse.json({ colecoes });
  } catch (err) {
    return errorResponse(err, 'Erro ao listar as bibliotecas');
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await req.json();
    const name = nomeValido(body.name);
    if (name === null) {
      return NextResponse.json({ error: NOME_VAZIO }, { status: 400 });
    }

    const rows = await withUser(userId, (tx) =>
      tx.insert(collections).values({ userId, name })
        .returning({ id: collections.id, name: collections.name }));

    return NextResponse.json(rows[0]);
  } catch (err) {
    if (ehNomeDuplicado(err)) {
      return NextResponse.json({ error: NOME_DUPLICADO }, { status: 409 });
    }
    return errorResponse(err, 'Erro ao criar a biblioteca');
  }
}
