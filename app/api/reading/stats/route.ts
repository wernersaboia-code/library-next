import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import { sql, eq, and, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';

// AD-7 da spec do tracker: estatísticas de leitura ignoram posse (`owned`) —
// apagar um livro do Calibre não pode apagar o histórico de que ele foi
// lido. Só o "acervo" (totalBooks/naoLidos) é restrito a livros possuídos.
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const data = await withUser(userId, async (tx) => {
      const one = (where?: ReturnType<typeof eq>) =>
        tx.select({ n: sql<number>`count(*)` }).from(books)
          .where(where).then((r) => Number(r[0].n));

      const totalBooks = await one(eq(books.owned, true));
      const lendo = await one(eq(books.read_status, 'lendo'));
      const lidos = await one(eq(books.read_status, 'lido'));
      const abandonados = await one(eq(books.read_status, 'abandonado'));
      const naoLidos = await one(
        and(eq(books.owned, true), eq(books.read_status, 'não lido'))
      );
      // AD-2: livro lido sem data é estado válido. O painel diz quantos são,
      // senão "Lidos: 4" ao lado de um gráfico vazio parece defeito.
      const lidosSemData = await one(
        and(eq(books.read_status, 'lido'), isNull(books.date_finished))
      );

      const paginasLidas = await tx
        .select({ t: sql<number>`coalesce(sum(${books.num_pages}),0)` })
        .from(books).where(eq(books.read_status, 'lido'))
        .then((r) => Number(r[0].t));

      // Um período é definido pela data de conclusão. `date_trunc` compara
      // no fuso do banco; livro terminado em 31/12 fica no ano dele.
      const periodo = async (unidade: 'month' | 'year') => {
        const [row] = await tx
          .select({
            livros: sql<number>`count(*)`,
            paginas: sql<number>`coalesce(sum(${books.num_pages}),0)`,
          })
          .from(books)
          .where(and(
            eq(books.read_status, 'lido'),
            sql`date_trunc(${unidade}, ${books.date_finished})
                = date_trunc(${unidade}, current_date)`
          ));
        return { livros: Number(row.livros), paginas: Number(row.paginas) };
      };

      const mes = await periodo('month');
      const ano = await periodo('year');

      const porAnoRows = await tx
        .select({
          ano: sql<string>`extract(year from ${books.date_finished})::text`,
          n: sql<number>`count(*)`,
        })
        .from(books)
        .where(sql`${books.date_finished} is not null`)
        .groupBy(sql`extract(year from ${books.date_finished})`);
      const porAno = Object.fromEntries(
        porAnoRows.map((r) => [r.ano, Number(r.n)])
      );

      return {
        totalBooks, lendo, lidos, abandonados, naoLidos,
        lidosSemData, paginasLidas, mes, ano, porAno,
      };
    });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err, 'Erro ao calcular estatísticas');
  }
}
