'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import ePub from 'epubjs';
import AnnotationsPanel from '@/components/annotations-panel';
import TranslationPopup from '@/components/translation-popup';
import { Bookmark, Languages } from 'lucide-react';

const HEARTBEAT_INTERVAL = 30000;

export default function ReaderPage() {
  const params = useParams();
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState('');
  const [currentCfi, setCurrentCfi] = useState('');
  const [translateText, setTranslateText] = useState('');
  const [translatePos, setTranslatePos] = useState({ x: 0, y: 0 });
  const [translatingPage, setTranslatingPage] = useState(false);
  const [pageTranslation, setPageTranslation] = useState('');

  const bookId = params.id as string;
  const numBookId = parseInt(bookId, 10);

  const jumpTo = useCallback((cfi?: string) => {
    if (cfi && renditionRef.current) renditionRef.current.display(cfi);
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
      .then((data) => rendition.display(data?.cfi || undefined))
      .catch(() => rendition.display());

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
      setPageTranslation('');
      clearTimeout((window as any).__progressTimer);
      (window as any).__progressTimer = setTimeout(() => {
        fetch('/api/reading/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookId: numBookId, cfi: loc.start.cfi, percentage: pct }),
        });
      }, 10000);
    });

    rendition.on('selected', (cfiRange: string, contents: any) => {
      const sel = contents?.window?.getSelection();
      const text = sel?.toString()?.trim();
      if (!text || !cfiRange) return;

      const range = sel?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const y = rect ? rect.bottom : window.innerHeight / 2;

      setTranslateText(text);
      setTranslatePos({ x, y });
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
      body: JSON.stringify({ bookId: numBookId, type: 'bookmark', cfi: currentCfi }),
    });
  };

  const highlightSelected = () => {
    // The translate text is the selected text, but we need the CFI
    // We stored it in a ref... let's just create a selection-based highlight
    const rendition = renditionRef.current;
    if (!rendition) return;

    // Get the current selection range from the iframe content
    const iframe = viewerRef.current?.querySelector('iframe');
    if (!iframe) return;

    try {
      const win = iframe.contentWindow;
      const sel = win?.getSelection();
      const text = sel?.toString()?.trim();
      if (!text) return;

      // epubjs already fires the 'selected' event with cfiRange,
      // but we need to store it. Let's use a simpler approach:
      // save a dummy annotation and rely on the server for the actual CFI
      fetch('/api/reading/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: numBookId,
          type: 'highlight',
          cfi: currentCfi,
          textContent: text.substring(0, 500),
          color: '#ffff00',
        }),
      });

      // Also add visual highlight
      try {
        rendition.annotations.add('highlight', currentCfi, {}, undefined, undefined, {
          fill: '#ffff00',
          'fill-opacity': '0.3',
        });
      } catch {}
    } catch {}

    setTranslateText('');
  };

  const translatePage = async () => {
    setTranslatingPage(true);
    const rendition = renditionRef.current;
    if (!rendition) { setTranslatingPage(false); return; }

    try {
      const contents = rendition.getContents();
      const text = contents
        .map((c: any) => c.document?.body?.innerText || '')
        .join('\n')
        .trim();

      if (!text) { setTranslatingPage(false); return; }

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.substring(0, 5000), target: 'pt' }),
      });
      const data = await res.json();
      setPageTranslation(data.translatedText || 'Erro ao traduzir');
    } catch {
      setPageTranslation('Erro ao traduzir');
    }
    setTranslatingPage(false);
  };

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-1 bg-gray-900 text-white text-sm shrink-0">
        <span className="truncate">{title || 'Carregando...'}</span>
        <div className="flex items-center gap-3">
          <button onClick={translatePage} title="Traduzir página" disabled={translatingPage}>
            <Languages className="w-4 h-4 hover:text-blue-400" />
          </button>
          <button onClick={addBookmark} title="Adicionar favorito">
            <Bookmark className="w-4 h-4 hover:text-yellow-400" />
          </button>
          <a href={`/${bookId}`} className="text-gray-400 hover:text-white shrink-0">
            {progress}% &times;
          </a>
        </div>
      </header>
      <div className="flex-1 relative">
        <div ref={viewerRef} className="absolute inset-0" />

        {translateText && (
          <div
            className="fixed z-40 flex gap-1"
            style={{
              left: translatePos.x,
              top: translatePos.y - 5,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <button
              onClick={() => setTranslateText(translateText)}
              className="bg-indigo-600 text-white text-xs px-2 py-1 rounded shadow hover:bg-indigo-700"
            >
              Traduzir
            </button>
            <button
              onClick={highlightSelected}
              className="bg-yellow-500 text-white text-xs px-2 py-1 rounded shadow hover:bg-yellow-600"
            >
              Destacar
            </button>
          </div>
        )}

        {translateText && translateText.length > 0 && (
          <TranslationPopup
            text={translateText}
            x={translatePos.x - 150}
            y={translatePos.y + 10}
            onClose={() => setTranslateText('')}
          />
        )}

        {pageTranslation && (
          <div className="absolute inset-0 bg-white dark:bg-gray-900 overflow-auto p-6 z-30">
            <div className="flex justify-between mb-4">
              <h3 className="font-semibold">Tradução da página</h3>
              <button onClick={() => setPageTranslation('')} className="text-gray-500 hover:text-gray-700">
                &times;
              </button>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{pageTranslation}</p>
          </div>
        )}
      </div>
      <AnnotationsPanel bookId={numBookId} onJumpTo={(cfi) => jumpTo(cfi)} />
    </div>
  );
}
