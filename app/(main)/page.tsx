import { Suspense } from 'react';
import { BooksGrid } from '@/components/grid';
import { BookPagination } from '@/components/book-pagination';
import Dashboard from '@/components/dashboard';
import {
  estimateTotalBooks,
  fetchBooksWithPagination,
  fetchReadingNow,
  fetchReadingStats,
  ITEMS_PER_PAGE,
} from '@/lib/db/queries';
import { ReadingStrip } from '@/components/reading-strip';
import { parseSearchParams, paginaValida } from '@/lib/url-state';
import { getCurrentUserId } from '@/lib/auth-user';
import { fetchCollections } from '@/lib/db/collections';

export default async function Page(
  props: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const parsedSearchParams = parseSearchParams(searchParams);
  const userId = await getCurrentUserId();

  // A grade sai na mesma leva do total (AD-8): a dependência era só para
  // "prender" a página pedida à faixa existente. O caso raro de página fora
  // do alcance (URL à mão) rebusca com a página ajustada; o comum ganha um
  // round-trip a menos em toda carga.
  const requestedPage = Math.max(1, Number(parsedSearchParams.page) || 1);
  const [estimatedTotal, bibliotecas, lendoAgora, stats, booksNaPaginaPedida] =
    await Promise.all([
      estimateTotalBooks(userId, parsedSearchParams),
      fetchCollections(userId),
      fetchReadingNow(userId),
      fetchReadingStats(userId),
      fetchBooksWithPagination(userId, {
        ...parsedSearchParams,
        page: String(requestedPage),
      }),
    ]);

  const totalPages = Math.ceil(estimatedTotal / ITEMS_PER_PAGE);
  const currentPage = paginaValida(parsedSearchParams.page, totalPages);

  const books =
    requestedPage === currentPage
      ? booksNaPaginaPedida
      : await fetchBooksWithPagination(userId, {
          ...parsedSearchParams,
          page: String(currentPage),
        });

  return (
    <div className="flex flex-col h-full">
      {/* O painel vem do servidor, junto com a grade: antes ele buscava
          /api/reading/stats no cliente e só aparecia depois da hidratação
          mais um round-trip. */}
      <Dashboard stats={stats} />
      <div className="flex-grow overflow-auto min-h-[200px]">
        <div className="group-has-[[data-pending]]:animate-pulse p-4">
          <ReadingStrip livros={lendoAgora} />
          <BooksGrid
            books={books}
            searchParams={parsedSearchParams}
            bibliotecas={bibliotecas}
          />
        </div>
      </div>
      <div className="mt-auto p-4 border-t">
        <Suspense fallback={null}>
          <BookPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalResults={estimatedTotal}
            searchParams={parsedSearchParams}
          />
        </Suspense>
      </div>
    </div>
  );
}
