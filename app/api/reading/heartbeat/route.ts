import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { readingProgress, readingSessions } from '@/lib/db/schema';
import { getOrCreateAppUserId } from '@/lib/db/users';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { bookId, seconds } = await req.json();
  if (!bookId || !seconds) {
    return NextResponse.json({ error: 'bookId e seconds obrigatórios' }, { status: 400 });
  }

  const userId = await getOrCreateAppUserId(session.user.email);

  // Atualiza segundos acumulados de forma atômica (upsert por user_id+book_id)
  await db
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
  await db.insert(readingSessions).values({
    userId,
    bookId,
    durationSeconds: seconds,
  });

  return NextResponse.json({ success: true });
}
