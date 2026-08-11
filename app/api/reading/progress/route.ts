import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { readingProgress } from '@/lib/db/schema';
import { getOrCreateAppUserId } from '@/lib/db/users';
import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const bookId = searchParams.get('bookId');
  if (!bookId)
    return NextResponse.json({ error: 'bookId obrigatório' }, { status: 400 });

  const userId = await getOrCreateAppUserId(session.user.email);

  const progress = await db
    .select()
    .from(readingProgress)
    .where(
      and(
        eq(readingProgress.userId, userId),
        eq(readingProgress.bookId, parseInt(bookId))
      )
    )
    .limit(1)
    .then((r) => r[0] || null);

  return NextResponse.json(progress);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { bookId, cfi, percentage } = await req.json();
  const userId = await getOrCreateAppUserId(session.user.email);
  const locator = cfi ? { kind: 'epub' as const, cfi } : {};

  const existing = await db
    .select({ id: readingProgress.id })
    .from(readingProgress)
    .where(
      and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, bookId))
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(readingProgress)
      .set({ locator, percentage: String(percentage), updatedAt: sql`now()` })
      .where(eq(readingProgress.id, existing[0].id));
  } else {
    await db
      .insert(readingProgress)
      .values({ userId, bookId, locator, percentage: String(percentage) });
  }

  return NextResponse.json({ success: true });
}
