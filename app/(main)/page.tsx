import { Suspense } from 'react';
import { BooksGrid } from '@/components/grid';
import { BookPagination } from '@/components/book-pagination';
import Dashboard from '@/components/dashboard';
import {
  estimateTotalBooks,
  fetchBooksWithPagination,
  fetchReadingNow,
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

  // O total vem primeiro: sem ele não dá para limitar a página pedida, e
  // consultar com uma página inexistente devolveria grade vazia enquanto a
  // paginação diz "página 42". Ver AD-8.
  const [estimatedTotal, bibliotecas, lendoAgora] = await Promise.all([
    estimateTotalBooks(userId, parsedSearchParams),
    fetchCollections(userId),
    fetchReadingNow(userId),
  ]);

  const totalPages = Math.ceil(estimatedTotal / ITEMS_PER_PAGE);
  const currentPage = paginaValida(parsedSearchParams.page, totalPages);

  const books = await fetchBooksWithPagination(userId, {
    ...parsedSearchParams,
    page: String(currentPage),
  });

  return (
    <div className="flex flex-col h-full">
      <Suspense fallback={null}>
        <Dashboard />
      </Suspense>
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
