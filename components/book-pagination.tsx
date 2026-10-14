import { buttonVariants } from '@/components/ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import { hrefDaPagina, type SearchParams } from '@/lib/url-state';

/**
 * Navegação nativa intencional: a troca de página precisa funcionar mesmo
 * quando o router cliente, seu prefetch ou a hidratação não respondem.
 */
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
  if (totalPages <= 1) return null;

  function seta(pagina: number, label: string, disabled: boolean, proxima: boolean) {
    const texto = <>
      {!proxima && <span aria-hidden>←</span>}
      <span>{label}</span>
      {proxima && <span aria-hidden>→</span>}
    </>;
    const className = `${buttonVariants({ variant: 'outline', size: 'sm' })} gap-1.5`;
    return disabled
      ? <span aria-disabled="true" className={`${className} opacity-50`}>{texto}</span>
      : <a href={hrefDaPagina(searchParams, pagina)} className={className}>{texto}</a>;
  }

  return (
    <Pagination aria-label="Páginas do acervo">
      <PaginationContent className="flex w-full items-center justify-between gap-2">
        <PaginationItem>
          {seta(currentPage - 1, 'Anterior', currentPage <= 1, false)}
        </PaginationItem>

        <PaginationItem className="min-w-0">
          <form action="/" method="get" className="flex flex-wrap items-center justify-center gap-2">
            {Object.entries(searchParams).map(([key, value]) =>
              key !== 'page' && value !== undefined
                ? <input key={key} type="hidden" name={key} value={value} />
                : null
            )}
            <span className="text-center text-sm text-muted-foreground">
              {totalResults.toLocaleString('pt-BR')} resultados · página
            </span>
            <label htmlFor="ir-para-pagina" className="sr-only">Ir para a página</label>
            <input
              id="ir-para-pagina"
              name="page"
              type="number"
              inputMode="numeric"
              min={1}
              max={totalPages}
              required
              defaultValue={currentPage}
              className="h-9 w-16 rounded-md border border-input bg-background px-2 text-center text-sm"
            />
            <span className="text-sm text-muted-foreground">de {totalPages.toLocaleString('pt-BR')}</span>
            <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Ir</button>
          </form>
        </PaginationItem>

        <PaginationItem>
          {seta(currentPage + 1, 'Próxima', currentPage >= totalPages, true)}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
