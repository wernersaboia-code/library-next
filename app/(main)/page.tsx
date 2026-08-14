import { Suspense } from 'react';
import { BooksGrid } from '@/components/grid';
import { BookPagination } from '@/components/book-pagination';
import Dashboard from '@/components/dashboard';
import {
  estimateTotalBooks,
  fetchBooksWithPagination,
  ITEMS_PER_PAGE,
} from '@/lib/db/queries';
import { parseSearchParams } from '@/lib/url-state';
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

  const [books, estimatedTotal, bibliotecas] = await Promise.all([
    fetchBooksWithPagination(userId, parsedSearchParams),
    estimateTotalBooks(userId, parsedSearchParams),
    fetchCollections(userId),
  ]);

  const totalPages = Math.ceil(estimatedTotal / ITEMS_PER_PAGE);
  const currentPage = Math.max(1, Number(parsedSearchParams.page) || 1);

  return (
    <div className="flex flex-col h-full">
      <Suspense fallback={null}>
        <Dashboard />
      </Suspense>
      <div className="flex-grow overflow-auto min-h-[200px]">
        <div className="group-has-[[data-pending]]:animate-pulse p-4">
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
