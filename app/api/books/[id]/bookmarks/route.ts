import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { bookmarks } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';

function parseBookId(id: string): number | null {
  const bookId = Number(id);
  if (!Number.isInteger(bookId) || bookId <= 0) return null;
  return bookId;
}

/**
 * Valida o locator do leitor. EPUB precisa de `cfi`; PDF, de `page` inteira
 * positiva. Devolve o objeto normalizado (só os campos conhecidos) ou null.
 */
function parseLocator(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object') return null;
  const l = v as Record<string, unknown>;
  if (l.format === 'epub' && typeof l.cfi === 'string' && l.cfi) {
    return {
      format: 'epub',
      cfi: l.cfi,
      ...(typeof l.href === 'string' && l.href ? { href: l.href } : {}),
    };
  }
  if (l.format === 'pdf') {
    const page = Number(l.page);
    if (Number.isInteger(page) && page > 0) return { format: 'pdf', page };
  }
  return null;
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
      tx.select().from(bookmarks)
        .where(eq(bookmarks.bookId, bookId))
        .orderBy(asc(bookmarks.createdAt)));

    return NextResponse.json(rows);
  } catch (err) {
    return errorResponse(err, 'Erro ao buscar os marcadores');
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
    const locator = parseLocator(body.locator);
    if (!locator)
      return NextResponse.json({ error: 'locator inválido' }, { status: 400 });

    const label = typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, 120)
      : null;

    const rows = await withUser(userId, (tx) =>
      tx.insert(bookmarks).values({
        userId,
        bookId,
        locator,
        label,
      }).returning({ id: bookmarks.id }));

    return NextResponse.json(rows[0]);
  } catch (err) {
    return errorResponse(err, 'Erro ao criar o marcador');
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
    if (typeof body.bookmarkId !== 'string' || !body.bookmarkId)
      return NextResponse.json({ error: 'bookmarkId é obrigatório' }, { status: 400 });

    const rows = await withUser(userId, (tx) =>
      tx.delete(bookmarks)
        .where(and(eq(bookmarks.id, body.bookmarkId), eq(bookmarks.bookId, bookId)))
        .returning({ id: bookmarks.id }));

    if (rows.length === 0)
      return NextResponse.json({ error: 'marcador não encontrado' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao apagar o marcador');
  }
}
