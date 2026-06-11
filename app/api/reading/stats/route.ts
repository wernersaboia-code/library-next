import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { books, readingProgress, readingSessions } from '@/lib/db/schema';
import { sql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const totalBooks = await db
    .select({ count: sql<number>`count(*)` })
    .from(books)
    .then((r) => Number(r[0].count));

  const lendo = await db
    .select({ count: sql<number>`count(*)` })
    .from(books)
    .where(eq(books.read_status, 'lendo'))
    .then((r) => Number(r[0].count));

  const lidos = await db
    .select({ count: sql<number>`count(*)` })
    .from(books)
    .where(eq(books.read_status, 'lido'))
    .then((r) => Number(r[0].count));

  const paginasLidas = await db
    .select({ total: sql<number>`coalesce(sum(${books.num_pages}), 0)` })
    .from(books)
    .where(eq(books.read_status, 'lido'))
    .then((r) => Number(r[0].total));

  const totalMinutes = await db
    .select({ total: sql<number>`coalesce(sum(${readingProgress.minutesRead}), 0)` })
    .from(readingProgress)
    .then((r) => Number(r[0].total));

  // Streak: conta dias consecutivos com sessões de leitura
  const streak = await db
    .select({ date: sql<string>`date(${readingSessions.startedAt})` })
    .from(readingSessions)
    .groupBy(sql`date(${readingSessions.startedAt})`)
    .orderBy(sql`date(${readingSessions.startedAt}) desc`)
    .limit(365);

  let currentStreak = 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  for (let i = 0; i < streak.length; i++) {
    const data = new Date(streak[i].date + 'T00:00:00');
    const diff = Math.round(
      (hoje.getTime() - data.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff === currentStreak) {
      currentStreak++;
    } else {
      break;
    }
  }

  return NextResponse.json({
    totalBooks,
    lendo,
    lidos,
    paginasLidas,
    totalMinutes,
    currentStreak,
    naoLidos: totalBooks - lendo - lidos,
  });
}
