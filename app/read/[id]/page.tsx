'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import ePub from 'epubjs';
import AnnotationsPanel from '@/components/annotations-panel';
import { Bookmark } from 'lucide-react';

const HEARTBEAT_INTERVAL = 30000;

export default function ReaderPage() {
  const params = useParams();
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState('');
  const [currentCfi, setCurrentCfi] = useState('');

  const bookId = params.id as string;
  const numBookId = parseInt(bookId, 10);

  const jumpTo = useCallback((cfi?: string) => {
    if (cfi && renditionRef.current) {
      renditionRef.current.display(cfi);
    }
  }, []);

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

    fetch(`/api/reading/progress?bookId=${bookId}`)
      .then((r) => r.json())
      .then((data) => {
        rendition.display(data?.cfi || undefined);
      })
      .catch(() => {
        rendition.display();
      });

    // Carrega highlights existentes
    fetch(`/api/reading/annotations?bookId=${bookId}`)
      .then((r) => r.json())
      .then((anns: any[]) => {
        anns.forEach((a: any) => {
          if (a.type === 'highlight' && a.cfi) {
            try {
              rendition.annotations.add('highlight', a.cfi, {}, undefined, undefined, {
                fill: a.color || '#ffff00',
                'fill-opacity': '0.3',
              });
            } catch {}
          }
        });
      });

    rendition.on('relocated', (loc: any) => {
      const pct = loc.start?.percentage || 0;
      setProgress(Math.round(pct * 100));
      setCurrentCfi(loc.start?.cfi || '');

      clearTimeout((window as any).__progressTimer);
      (window as any).__progressTimer = setTimeout(() => {
        fetch('/api/reading/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookId: numBookId, cfi: loc.start.cfi, percentage: pct }),
        });
      }, 10000);
    });

    // Captura seleção de texto para highlight
    rendition.on('selected', (cfiRange: string, contents: any) => {
      const text = contents?.window?.getSelection()?.toString() || '';
      if (!text || !cfiRange) return;

      rendition.annotations.add('highlight', cfiRange, {}, undefined, undefined, {
        fill: '#ffff00',
        'fill-opacity': '0.3',
      });

      fetch('/api/reading/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: numBookId,
          type: 'highlight',
          cfi: cfiRange,
          textContent: text.substring(0, 500),
          color: '#ffff00',
        }),
      });
    });

    const heartbeat = setInterval(() => {
      fetch('/api/reading/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: numBookId, seconds: HEARTBEAT_INTERVAL / 1000 }),
      });
    }, HEARTBEAT_INTERVAL);

    return () => {
      clearInterval(heartbeat);
      rendition.destroy();
    };
  }, [bookId, numBookId]);

  const addBookmark = () => {
    if (!currentCfi) return;
    fetch('/api/reading/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookId: numBookId,
        type: 'bookmark',
        cfi: currentCfi,
      }),
    });
  };

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-1 bg-gray-900 text-white text-sm shrink-0">
        <span className="truncate">{title || 'Carregando...'}</span>
        <div className="flex items-center gap-3">
          <button onClick={addBookmark} title="Adicionar favorito">
            <Bookmark className="w-4 h-4 hover:text-yellow-400" />
          </button>
          <a href={`/${bookId}`} className="text-gray-400 hover:text-white shrink-0">
            {progress}% &times;
          </a>
        </div>
      </header>
      <div ref={viewerRef} className="flex-1" />
      <AnnotationsPanel bookId={numBookId} onJumpTo={(cfi) => jumpTo(cfi)} />
    </div>
  );
}
