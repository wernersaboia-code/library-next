'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Bookmark } from '@/lib/db/bookmarks';

interface BookmarksSectionProps {
  bookId: number;
  initial: Bookmark[];
}

/** Link para o leitor já posicionado no marcador (deep-link via query). */
function hrefDoLocator(bookId: number, locator: unknown): string {
  const l = locator as Record<string, unknown> | null;
  if (l && l.format === 'epub' && typeof l.cfi === 'string') {
    return `/${bookId}/read?cfi=${encodeURIComponent(l.cfi)}`;
  }
  if (l && l.format === 'pdf' && Number.isInteger(Number(l.page))) {
    return `/${bookId}/read?page=${Number(l.page)}`;
  }
  return `/${bookId}/read`;
}

export function BookmarksSection({ bookId, initial }: BookmarksSectionProps) {
  const [marcadores, setMarcadores] = useState<Bookmark[]>(initial);
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);

  async function apagar(id: string) {
    setErro(null);
    setApagando(id);
    try {
      const res = await fetch(`/api/books/${bookId}/bookmarks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarkId: id }),
      });
      if (!res.ok) {
        setErro('Não foi possível apagar o marcador.');
        return;
      }
      setMarcadores((ms) => ms.filter((m) => m.id !== id));
    } catch {
      setErro('Falha de rede ao apagar o marcador.');
    } finally {
      setApagando(null);
    }
  }

  return (
    <div className="mb-6 space-y-3 rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border">
      <h2 className="text-lg font-semibold">Marcadores</h2>

      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}

      {marcadores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum marcador ainda. Marque páginas durante a leitura.
        </p>
      ) : (
        <ul className="space-y-2">
          {marcadores.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-md border p-2"
            >
              <Link
                href={hrefDoLocator(bookId, m.locator)}
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                {m.label ?? 'Marcador'}
              </Link>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => void apagar(m.id)}
                disabled={apagando === m.id}
              >
                Apagar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
