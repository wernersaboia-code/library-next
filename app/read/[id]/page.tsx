'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ePub from 'epubjs';

export default function ReaderPage() {
  const params = useParams();
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState('');

  const bookId = params.id as string;

  useEffect(() => {
    if (!viewerRef.current) return;

    const book = ePub(`/api/drive/read?bookId=${bookId}`);

    book.loaded.metadata.then((meta: any) => {
      setTitle(meta.title || '');
    });

    const rendition = book.renderTo(viewerRef.current!, {
      width: '100%',
      height: '100%',
      spread: 'none',
      flow: 'paginated',
      manager: 'default',
    });
    renditionRef.current = rendition;

    // Carrega progresso e exibe
    fetch(`/api/reading/progress?bookId=${bookId}`)
      .then((r) => r.json())
      .then((data) => {
        rendition.display(data?.cfi || undefined);
      })
      .catch(() => {
        rendition.display();
      });

    rendition.on('relocated', (loc: any) => {
      const pct = loc.start?.percentage || 0;
      setProgress(Math.round(pct * 100));

      clearTimeout((window as any).__progressTimer);
      (window as any).__progressTimer = setTimeout(() => {
        fetch('/api/reading/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookId: parseInt(bookId),
            cfi: loc.start.cfi,
            percentage: pct,
          }),
        });
      }, 10000);
    });

    return () => {
      rendition.destroy();
    };
  }, [bookId]);

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-1 bg-gray-900 text-white text-sm shrink-0">
        <span className="truncate">{title || 'Carregando...'}</span>
        <a
          href={`/${bookId}`}
          className="text-gray-400 hover:text-white ml-4 shrink-0"
        >
          {progress}% &times;
        </a>
      </header>
      <div ref={viewerRef} className="flex-1" />
    </div>
  );
}
