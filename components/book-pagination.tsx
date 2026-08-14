'use client';

import Form from 'next/form';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import { SearchParams } from '@/lib/url-state';

function FormValues({
  searchParams,
  pageNumber,
}: {
  searchParams: SearchParams;
  pageNumber: number;
}) {
  const { pending } = useFormStatus();

  return (
    <div data-pending={pending ? '' : undefined}>
      {Object.entries(searchParams).map(
        ([key, value]) =>
          key !== 'page' && (
            <input key={key} type="hidden" name={key} value={value as string} />
          )
      )}
      <input type="hidden" name="page" value={pageNumber.toString()} />
    </div>
  );
}

export function BookPagination({
  currentPage,
  totalPages,
  totalResults,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  totalResults: number;
  searchParams: SearchParams;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <Pagination>
      <PaginationContent className="flex items-center justify-between">
        <PaginationItem>
          <Form action="/">
            <FormValues
              searchParams={searchParams}
              pageNumber={Math.max(1, currentPage - 1)}
            />
            <Button
              variant="ghost"
              type="submit"
              size="icon"
              disabled={currentPage <= 1}
            >
              ←
            </Button>
          </Form>
        </PaginationItem>

        {/* Não reutilizamos FormValues aqui: ele grava um `page` escondido,
            que colidiria com o campo visível — dois inputs de mesmo nome
            enviam os dois valores, e o servidor leria o errado. */}
        <Form action="/" className="flex flex-wrap items-center justify-center gap-2">
          {Object.entries(searchParams).map(
            ([key, value]) =>
              key !== 'page' && (
                <input key={key} type="hidden" name={key} value={value as string} />
              )
          )}
          <span className="text-sm text-muted-foreground">
            {totalResults.toLocaleString()} resultados · página
          </span>
          <label htmlFor="ir-para-pagina" className="sr-only">
            Ir para a página
          </label>
          <input
            id="ir-para-pagina"
            name="page"
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            defaultValue={currentPage}
            className="h-9 w-16 rounded-md border border-input bg-background px-2 text-center text-sm"
          />
          <span className="text-sm text-muted-foreground">
            de {totalPages.toLocaleString()}
          </span>
          <Button type="submit" variant="outline" size="sm">
            Ir
          </Button>
        </Form>

        <PaginationItem>
          <Form action="/">
            <FormValues
              searchParams={searchParams}
              pageNumber={Math.min(totalPages, currentPage + 1)}
            />
            <Button
              variant="ghost"
              type="submit"
              size="icon"
              disabled={currentPage >= totalPages}
            >
              →
            </Button>
          </Form>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
