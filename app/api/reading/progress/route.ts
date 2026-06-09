import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { readingProgress } from '@/lib/db/schema';
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

  const progress = await db
    .select()
    .from(readingProgress)
    .where(eq(readingProgress.bookId, parseInt(bookId)))
    .limit(1)
    .then((r) => r[0] || null);

  return NextResponse.json(progress);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { bookId, cfi, percentage } = await req.json();

  await db
    .insert(readingProgress)
    .values({ bookId, cfi, percentage: String(percentage) })
    .onConflictDoUpdate({
      target: readingProgress.bookId,
      set: { cfi, percentage: String(percentage), updatedAt: sql`now()` },
    });

  return NextResponse.json({ success: true });
}
