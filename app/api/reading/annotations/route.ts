import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { highlights, type Locator } from '@/lib/db/schema';
import { getOrCreateAppUserId } from '@/lib/db/users';
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
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const bookId = searchParams.get('bookId');
  if (!bookId)
    return NextResponse.json({ error: 'bookId obrigatório' }, { status: 400 });

  const list = await db
    .select()
    .from(highlights)
    .where(eq(highlights.bookId, parseInt(bookId)))
    .orderBy(highlights.createdAt);

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
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { bookId, type, cfi, page, textContent, note, color } = await req.json();
  const userId = await getOrCreateAppUserId(session.user.email);

  const [ann] = await db
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
    .returning();

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
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { id } = await req.json();
  if (!id)
    return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  await db.delete(highlights).where(eq(highlights.id, id));
  return NextResponse.json({ success: true });
}
