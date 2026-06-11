'use client';

import { useParams } from 'next/navigation';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import AnnotationsPanel from '@/components/annotations-panel';
import TranslationPopup from '@/components/translation-popup';
import { Bookmark, Languages } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const HEARTBEAT_INTERVAL = 30000;

export default function PdfReaderPage() {
  const params = useParams();
  const bookId = params.id as string;
  const numBookId = parseInt(bookId, 10);
  const bookUrl = `/api/drive/read?bookId=${bookId}`;

  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [translateText, setTranslateText] = useState('');
  const [translatePos, setTranslatePos] = useState({ x: 0, y: 0 });
  const [pageTranslation, setPageTranslation] = useState('');
  const [translatingPage, setTranslatingPage] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/reading/progress?bookId=${bookId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.cfi) setPageNumber(parseInt(data.cfi, 10));
      });
  }, [bookId]);

  useEffect(() => {
    const heartbeat = setInterval(() => {
      fetch('/api/reading/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: numBookId, seconds: HEARTBEAT_INTERVAL / 1000 }),
      });
    }, HEARTBEAT_INTERVAL);
    return () => clearInterval(heartbeat);
  }, [bookId, numBookId]);

  // Detect text selection for translation popup
  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      const text = sel?.toString()?.trim();
      if (!text || text.length > 200) return;

      const range = sel?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;

      setTranslateText(text);
      setTranslatePos({ x: rect.left + rect.width / 2, y: rect.top - 5 });
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const onLoadSuccess = useCallback((pdf: { numPages: number }) => {
    setNumPages(pdf.numPages);
  }, []);

  const goToPage = useCallback(
    (page: number) => {
      const p = Math.max(1, Math.min(page, numPages));
      setPageNumber(p);
      setPageTranslation('');
      const percentage = p / numPages;
      fetch('/api/reading/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: numBookId, cfi: String(p), percentage }),
      });
    },
    [numBookId, numPages]
  );

  const addBookmark = () => {
    fetch('/api/reading/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId: numBookId, type: 'bookmark', page: pageNumber }),
    });
  };

  const jumpTo = useCallback((_cfi?: string, page?: number) => {
    if (page) goToPage(page);
  }, [goToPage]);

  const translatePage = async () => {
    setTranslatingPage(true);
    try {
      // Extrai texto visível da página via DOM do text layer
      const textLayer = pageRef.current?.querySelector('.react-pdf__Page__textContent');
      const text = textLayer?.textContent?.trim();
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

  const progress = numPages > 0 ? Math.round((pageNumber / numPages) * 100) : 0;

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-1 bg-gray-900 text-white text-sm shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1} className="disabled:opacity-30">
            &larr;
          </button>
          <span>
            Página{' '}
            <input
              type="number"
              min={1}
              max={numPages}
              value={pageNumber}
              onChange={(e) => goToPage(Number(e.target.value))}
              className="w-12 text-center bg-gray-800 rounded px-1"
            />{' '}
            de {numPages}
          </span>
          <button onClick={() => goToPage(pageNumber + 1)} disabled={pageNumber >= numPages} className="disabled:opacity-30">
            &rarr;
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={translatePage} title="Traduzir página" disabled={translatingPage}>
            <Languages className="w-4 h-4 hover:text-blue-400" />
          </button>
          <button onClick={addBookmark} title="Adicionar favorito">
            <Bookmark className="w-4 h-4 hover:text-yellow-400" />
          </button>
          <button onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>&minus;</button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(2, s + 0.25))}>+</button>
          <a href={`/${bookId}`} className="text-gray-400 hover:text-white">
            {progress}% &times;
          </a>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-gray-800 flex justify-center relative">
        <div ref={pageRef}>
          <Document
            file={bookUrl}
            onLoadSuccess={onLoadSuccess}
            loading={<div className="text-white p-8">Carregando PDF...</div>}
            error={<div className="text-red-400 p-8">Erro ao carregar PDF.</div>}
          >
            <Page pageNumber={pageNumber} scale={scale} renderTextLayer={true} renderAnnotationLayer={false} />
          </Document>
        </div>

        {translateText && (
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

      <AnnotationsPanel bookId={numBookId} onJumpTo={jumpTo} />
    </div>
  );
}
