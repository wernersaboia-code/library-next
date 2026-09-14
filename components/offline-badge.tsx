'use client';

import { HardDriveDownloadIcon } from 'lucide-react';
import { useOffline } from './offline-provider';

/** Selo na capa quando o livro está salvo para leitura offline. */
export function OfflineBadge({ bookId }: { bookId: number }) {
  const { ids } = useOffline();
  if (!ids.has(bookId)) return null;

  return (
    <span
      title="Disponível offline"
      className="absolute bottom-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-sky-600/95 shadow-sm ring-1 ring-white/40 backdrop-blur-sm"
    >
      <HardDriveDownloadIcon aria-hidden className="h-3.5 w-3.5 text-white" />
      <span className="sr-only">Disponível offline</span>
    </span>
  );
}
