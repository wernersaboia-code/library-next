import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import { sql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const data = await withUser(userId, async (tx) => {
      const one = (where?: ReturnType<typeof eq>) =>
        tx.select({ n: sql<number>`count(*)` }).from(books)
          .where(where).then((r) => Number(r[0].n));
      const totalBooks = await one();
      const lendo = await one(eq(books.read_status, 'lendo'));
      const lidos = await one(eq(books.read_status, 'lido'));
      const paginasLidas = await tx
        .select({ t: sql<number>`coalesce(sum(${books.num_pages}),0)` })
        .from(books).where(eq(books.read_status, 'lido'))
        .then((r) => Number(r[0].t));
      return { totalBooks, lendo, lidos, paginasLidas };
    });
    return NextResponse.json({
      ...data, naoLidos: data.totalBooks - data.lendo - data.lidos,
    });
  } catch (err) {
    return errorResponse(err, 'Erro ao calcular estatísticas');
  }
}
