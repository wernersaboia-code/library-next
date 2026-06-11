'use client';

import { useEffect, useState } from 'react';
import { X, Bookmark, Highlighter, StickyNote } from 'lucide-react';

interface Annotation {
  id: number;
  bookId: number;
  type: 'highlight' | 'bookmark' | 'note';
  cfi: string | null;
  page: number | null;
  textContent: string | null;
  note: string | null;
  color: string | null;
  createdAt: string;
}

interface Props {
  bookId: number;
  onJumpTo?: (cfi?: string, page?: number) => void;
}

export default function AnnotationsPanel({ bookId, onJumpTo }: Props) {
  const [items, setItems] = useState<Annotation[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/reading/annotations?bookId=${bookId}`)
      .then((r) => r.json())
      .then(setItems);
  }, [bookId, open]);

  const remove = async (id: number) => {
    await fetch('/api/reading/annotations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setItems((prev) => prev.filter((a) => a.id !== id));
  };

  const icon = (type: string) => {
    switch (type) {
      case 'highlight':
        return <Highlighter className="w-4 h-4" />;
      case 'bookmark':
        return <Bookmark className="w-4 h-4" />;
      default:
        return <StickyNote className="w-4 h-4" />;
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed right-4 bottom-4 z-50 bg-indigo-600 text-white rounded-full p-3 shadow-lg hover:bg-indigo-700"
        title="Anotações"
      >
        <StickyNote className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed right-4 bottom-16 z-50 w-80 max-h-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-y-auto border">
          <div className="flex items-center justify-between p-3 border-b sticky top-0 bg-white dark:bg-gray-800">
            <h3 className="font-semibold text-sm">Anotações</h3>
            <button onClick={() => setOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {items.length === 0 && (
            <p className="p-4 text-sm text-gray-500">Nenhuma anotação</p>
          )}

          {items.map((a) => (
            <div
              key={a.id}
              className="p-3 border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                  {icon(a.type)}
                  <span>
                    {a.type === 'highlight'
                      ? 'Destaque'
                      : a.type === 'bookmark'
                        ? 'Favorito'
                        : 'Nota'}
                  </span>
                  {a.page && <span> • p.{a.page}</span>}
                </div>
                <button
                  onClick={() => remove(a.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {a.textContent && (
                <p
                  className="text-sm italic mb-1 px-1 rounded"
                  style={{ backgroundColor: a.color || '#ffff00' + '33' }}
                >
                  {a.textContent}
                </p>
              )}
              {a.note && <p className="text-sm text-gray-600 dark:text-gray-300">{a.note}</p>}

              {onJumpTo && (
                <button
                  onClick={() => onJumpTo(a.cfi || undefined, a.page || undefined)}
                  className="text-xs text-indigo-600 hover:underline mt-1"
                >
                  Ir para
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
