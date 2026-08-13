import { getCurrentUserId } from '@/lib/auth';
import { withUser } from '@/lib/db/with-user';
import { readingProgress, readingSessions } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();

    const { bookId, seconds } = await req.json();
    if (!bookId || !seconds) {
      return NextResponse.json({ error: 'bookId e seconds obrigatórios' }, { status: 400 });
    }

    await withUser(userId, async (tx) => {
      // Atualiza segundos acumulados de forma atômica (upsert por user_id+book_id)
      await tx
        .insert(readingProgress)
        .values({ userId, bookId, secondsRead: seconds })
        .onConflictDoUpdate({
          target: [readingProgress.userId, readingProgress.bookId],
          set: {
            secondsRead: sql`${readingProgress.secondsRead} + ${seconds}`,
            updatedAt: sql`now()`,
          },
        });

      // Registra sessão de leitura
      await tx.insert(readingSessions).values({
        userId,
        bookId,
        durationSeconds: seconds,
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao registrar tempo de leitura');
  }
}
