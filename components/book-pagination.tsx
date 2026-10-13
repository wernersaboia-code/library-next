'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import { hrefDaPagina, paginaValida, type SearchParams } from '@/lib/url-state';

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [destino, setDestino] = useState(currentPage);

  if (totalPages <= 1) return null;

  function navegar(pagina: number) {
    if (pending || pagina === currentPage) return;
    setDestino(pagina);
    startTransition(() => {
      router.push(hrefDaPagina(searchParams, pagina));
    });
  }

  function seta(pagina: number, label: string, simbolo: string, disabled: boolean) {
    if (disabled) {
      return <Button variant="ghost" size="icon" disabled aria-label={label}>{simbolo}</Button>;
    }
    return (
      <Button variant="ghost" size="icon" asChild>
        <Link
          href={hrefDaPagina(searchParams, pagina)}
          prefetch
          aria-label={label}
          aria-disabled={pending || undefined}
          className={pending ? 'pointer-events-none opacity-50' : undefined}
          onNavigate={(event) => {
            event.preventDefault();
            navegar(pagina);
          }}
        >
          {simbolo}
        </Link>
      </Button>
    );
  }

  return (
    <div data-pending={pending ? '' : undefined}>
      <Pagination aria-label="Páginas do acervo" aria-busy={pending}>
        <PaginationContent className="flex w-full items-center justify-between">
          <PaginationItem>
            {seta(currentPage - 1, 'Página anterior', '←', currentPage <= 1)}
          </PaginationItem>

          <PaginationItem>
            <form
              action="/"
              method="get"
              className="flex flex-wrap items-center justify-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const entrada = new FormData(event.currentTarget).get('page');
                navegar(paginaValida(entrada, totalPages));
              }}
            >
              {Object.entries(searchParams).map(([key, value]) =>
                key !== 'page' && value !== undefined
                  ? <input key={key} type="hidden" name={key} value={value} />
                  : null
              )}
              <span className="text-sm text-muted-foreground">
                {totalResults.toLocaleString('pt-BR')} resultados · página
              </span>
              <label htmlFor="ir-para-pagina" className="sr-only">Ir para a página</label>
              <input
                key={currentPage}
                id="ir-para-pagina"
                name="page"
                type="number"
                inputMode="numeric"
                min={1}
                max={totalPages}
                defaultValue={currentPage}
                disabled={pending}
                className="h-9 w-16 rounded-md border border-input bg-background px-2 text-center text-sm disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">de {totalPages.toLocaleString('pt-BR')}</span>
              <Button type="submit" variant="outline" size="sm" disabled={pending}>Ir</Button>
            </form>
          </PaginationItem>

          <PaginationItem>
            {seta(currentPage + 1, 'Próxima página', '→', currentPage >= totalPages)}
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <p role="status" className="mt-1 flex min-h-4 items-center justify-center gap-1.5 text-xs text-muted-foreground">
        {pending && <><LoaderCircleIcon className="h-3 w-3 animate-spin" aria-hidden />Carregando página {destino.toLocaleString('pt-BR')}…</>}
      </p>
    </div>
  );
}
