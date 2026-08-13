import { getCurrentUserId } from '@/lib/auth';
import { withUser } from '@/lib/db/with-user';
import { books, readingProgress, readingSessions } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import { sql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const userId = await getCurrentUserId();

    // Todas as agregações rodam sob withUser: o RLS escopa cada count/sum ao
    // próprio usuário automaticamente — nenhum where user_id manual é preciso.
    const data = await withUser(userId, async (tx) => {
      const totalBooks = await tx
        .select({ count: sql<number>`count(*)` })
        .from(books)
        .then((r) => Number(r[0].count));

      const lendo = await tx
        .select({ count: sql<number>`count(*)` })
        .from(books)
        .where(eq(books.read_status, 'lendo'))
        .then((r) => Number(r[0].count));

      const lidos = await tx
        .select({ count: sql<number>`count(*)` })
        .from(books)
        .where(eq(books.read_status, 'lido'))
        .then((r) => Number(r[0].count));

      const paginasLidas = await tx
        .select({ total: sql<number>`coalesce(sum(${books.num_pages}), 0)` })
        .from(books)
        .where(eq(books.read_status, 'lido'))
        .then((r) => Number(r[0].total));

      const totalMinutes = await tx
        .select({ total: sql<number>`coalesce(sum(${readingProgress.secondsRead}), 0)` })
        .from(readingProgress)
        .then((r) => Math.floor(Number(r[0].total) / 60));

      // Streak: conta dias consecutivos com sessões de leitura
      const streak = await tx
        .select({ date: sql<string>`date(${readingSessions.startedAt})` })
        .from(readingSessions)
        .groupBy(sql`date(${readingSessions.startedAt})`)
        .orderBy(sql`date(${readingSessions.startedAt}) desc`)
        .limit(365);

      return { totalBooks, lendo, lidos, paginasLidas, totalMinutes, streak };
    });

    let currentStreak = 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    for (let i = 0; i < data.streak.length; i++) {
      const dataDia = new Date(data.streak[i].date + 'T00:00:00');
      const diff = Math.round(
        (hoje.getTime() - dataDia.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diff === currentStreak) {
        currentStreak++;
      } else {
        break;
      }
    }

    return NextResponse.json({
      totalBooks: data.totalBooks,
      lendo: data.lendo,
      lidos: data.lidos,
      paginasLidas: data.paginasLidas,
      totalMinutes: data.totalMinutes,
      currentStreak,
      naoLidos: data.totalBooks - data.lendo - data.lidos,
    });
  } catch (err) {
    return errorResponse(err, 'Erro ao calcular estatísticas');
  }
}
