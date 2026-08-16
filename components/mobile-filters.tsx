'use client';

import { useEffect, useState } from 'react';
import { Suspense } from 'react';
import { SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Filter, FilterFallback, contarFiltrosAtivos } from '@/components/filters';
import { parseSearchParams } from '@/lib/url-state';

/**
 * Acesso aos filtros no celular: a sidebar é `hidden md:block`, então sem
 * este botão + drawer não havia como filtrar fora do desktop. O painel
 * reaproveita o mesmo <Filter> da sidebar.
 */
export function MobileFilters({
  bibliotecas,
}: {
  bibliotecas?: React.ComponentProps<typeof Filter>['bibliotecas'];
}) {
  const [aberto, setAberto] = useState(false);
  const searchParams = useSearchParams();
  const ativos = contarFiltrosAtivos(
    parseSearchParams(Object.fromEntries(searchParams))
  );

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', aoTecla);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', aoTecla);
    };
  }, [aberto]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAberto(true)}
        className="h-12 shrink-0 gap-2 px-4 md:hidden"
        aria-haspopup="dialog"
      >
        <SlidersHorizontalIcon className="h-4 w-4" aria-hidden />
        Filtros
        {ativos > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {ativos}
          </span>
        )}
      </Button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setAberto(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col bg-card text-card-foreground shadow-xl ring-1 ring-border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Filtros
                {ativos > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({ativos})
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Fechar filtros"
              >
                <XIcon className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Suspense fallback={<FilterFallback />}>
                <Filter bibliotecas={bibliotecas} />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
