'use client';

import { useId, useRef } from 'react';
import { XIcon } from 'lucide-react';
import { ReadingYearBars } from './reading-year-bars';

export function ReadingHistory({ anos }: { anos: [string, number][] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className="min-h-9 rounded-md px-2 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Ver histórico completo
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="fixed m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/40 open:flex open:flex-col"
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right ||
              event.clientY < bounds.top || event.clientY > bounds.bottom) {
            dialog.current?.close();
          }
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">Histórico de leituras</h2>
            <p id={descriptionId} className="mt-1 text-xs text-muted-foreground">
              Livros concluídos por ano, pela data de conclusão. Mais recentes primeiro.
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar histórico"
            onClick={() => dialog.current?.close()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div
          role="region"
          aria-label="Anos do histórico"
          tabIndex={0}
          className="min-h-0 overflow-y-auto overscroll-contain p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <ReadingYearBars anos={anos} />
        </div>
      </dialog>
    </>
  );
}
