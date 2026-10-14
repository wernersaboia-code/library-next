import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { savedSearches } from '@/lib/db/schema';
import { fetchSavedSearches } from '@/lib/db/saved-searches';
import { savedSearchName, savedSearchQuery } from '@/lib/saved-searches';
import { ehNomeDuplicado } from '@/lib/collections-input';
import { errorResponse } from '@/lib/errors';

export async function GET() {
  try {
    return NextResponse.json(await fetchSavedSearches(await getCurrentUserId()), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) { return errorResponse(err, 'Erro ao listar as estantes dinâmicas'); }
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await req.json().catch(() => null);
    const name = savedSearchName(body?.name);
    const query = savedSearchQuery(body?.query);
    if (!name || !query) return NextResponse.json({ error: 'Informe um nome de até 80 caracteres e uma busca com filtros válidos.' }, { status: 400 });
    const [saved] = await withUser(userId, (tx) => tx.insert(savedSearches).values({ userId, name, query })
      .returning({ id: savedSearches.id, name: savedSearches.name, query: savedSearches.query }));
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    if (ehNomeDuplicado(err)) return NextResponse.json({ error: 'Você já tem uma estante com esse nome.' }, { status: 409 });
    return errorResponse(err, 'Erro ao salvar a estante dinâmica');
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Estante inválida.' }, { status: 400 });
    const rows = await withUser(userId, (tx) => tx.delete(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId))).returning({ id: savedSearches.id }));
    return rows.length ? new Response(null, { status: 204 }) : NextResponse.json({ error: 'Estante não encontrada.' }, { status: 404 });
  } catch (err) { return errorResponse(err, 'Erro ao remover a estante dinâmica'); }
}
