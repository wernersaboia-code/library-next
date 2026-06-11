import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { annotations } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

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
    .from(annotations)
    .where(eq(annotations.bookId, parseInt(bookId)))
    .orderBy(annotations.createdAt);

  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { bookId, type, cfi, page, textContent, note, color } = await req.json();

  const [ann] = await db
    .insert(annotations)
    .values({ bookId, type, cfi, page, textContent, note, color })
    .returning();

  return NextResponse.json(ann);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { id } = await req.json();
  if (!id)
    return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  await db.delete(annotations).where(eq(annotations.id, id));
  return NextResponse.json({ success: true });
}
