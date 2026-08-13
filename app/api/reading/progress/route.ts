import { getCurrentUserId } from '@/lib/auth';
import { withUser } from '@/lib/db/with-user';
import { readingProgress } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const userId = await getCurrentUserId();

    const { searchParams } = new URL(req.url);
    const bookId = searchParams.get('bookId');
    if (!bookId)
      return NextResponse.json({ error: 'bookId obrigatório' }, { status: 400 });

    const progress = await withUser(userId, (tx) =>
      tx
        .select()
        .from(readingProgress)
        .where(
          and(
            eq(readingProgress.userId, userId),
            eq(readingProgress.bookId, parseInt(bookId))
          )
        )
        .limit(1)
        .then((r) => r[0] || null)
    );

    return NextResponse.json(progress);
  } catch (err) {
    return errorResponse(err, 'Erro ao ler progresso');
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();

    const { bookId, cfi, percentage } = await req.json();
    const locator = cfi ? { kind: 'epub' as const, cfi } : {};

    await withUser(userId, (tx) =>
      tx
        .insert(readingProgress)
        .values({ userId, bookId, locator, percentage: String(percentage) })
        .onConflictDoUpdate({
          target: [readingProgress.userId, readingProgress.bookId],
          set: { locator, percentage: String(percentage), updatedAt: sql`now()` },
        })
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao salvar progresso');
  }
}
