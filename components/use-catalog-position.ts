'use client';

import { useEffect, useRef, type MouseEvent } from 'react';
import { readCatalogPosition } from '@/lib/catalog-position';

/** Guarda um livro e sua posição visual, em vez de uma altura absoluta da página. */
export function useCatalogPosition(userId: string, query: string) {
  const ref = useRef<HTMLDivElement>(null);
  const storageKey = `catalog-position:${userId}`;

  useEffect(() => {
    let frame = 0;
    try {
      const position = readCatalogPosition(sessionStorage.getItem(storageKey), query);
      if (!position) return;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const card = ref.current?.querySelector<HTMLElement>(`[data-book-id="${position.bookId}"]`);
          if (!card) return;
          window.scrollTo({ top: window.scrollY + card.getBoundingClientRect().top - position.offset, behavior: 'instant' });
          card.focus({ preventScroll: true });
          try { sessionStorage.removeItem(storageKey); } catch { /* armazenamento indisponível */ }
        });
      });
    } catch { /* A navegação continua quando o armazenamento está bloqueado. */ }
    return () => cancelAnimationFrame(frame);
  }, [query, storageKey]);

  function remember(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const card = (event.target as Element).closest<HTMLElement>('a[data-book-id]');
    if (!card) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        query, bookId: Number(card.dataset.bookId),
        offset: card.getBoundingClientRect().top, savedAt: Date.now(),
      }));
    } catch { /* sessionStorage é uma melhoria opcional. */ }
  }

  return { ref, onClickCapture: remember };
}
