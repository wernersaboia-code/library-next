import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { readingProgress, readingSessions } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { bookId, seconds } = await req.json();
  if (!bookId || !seconds) {
    return NextResponse.json({ error: 'bookId e seconds obrigatórios' }, { status: 400 });
  }

  // Atualiza minutos acumulados
  await db
    .insert(readingProgress)
    .values({
      bookId,
      minutesRead: Math.max(1, Math.round(seconds / 60)),
    })
    .onConflictDoUpdate({
      target: readingProgress.bookId,
      set: {
        minutesRead: sql`${readingProgress.minutesRead} + ${Math.max(1, Math.round(seconds / 60))}`,
        updatedAt: sql`now()`,
      },
    });

  // Registra sessão de leitura
  await db.insert(readingSessions).values({
    bookId,
    durationSeconds: seconds,
  });

  return NextResponse.json({ success: true });
}
