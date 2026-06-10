'use client';

import { useParams } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfReaderPage() {
  const params = useParams();
  const bookId = params.id as string;
  const bookUrl = `/api/drive/read?bookId=${bookId}`;

  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    fetch(`/api/reading/progress?bookId=${bookId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.cfi) setPageNumber(parseInt(data.cfi, 10));
      });
  }, [bookId]);

  const onLoadSuccess = useCallback(
    (pdf: { numPages: number }) => {
      setNumPages(pdf.numPages);
    },
    []
  );

  const goToPage = useCallback(
    (page: number) => {
      const p = Math.max(1, Math.min(page, numPages));
      setPageNumber(p);
      const percentage = p / numPages;
      fetch('/api/reading/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: parseInt(bookId),
          cfi: String(p),
          percentage,
        }),
      });
    },
    [bookId, numPages]
  );

  const progress =
    numPages > 0 ? Math.round((pageNumber / numPages) * 100) : 0;

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-1 bg-gray-900 text-white text-sm shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1}
            className="disabled:opacity-30"
          >
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
          <button
            onClick={() => goToPage(pageNumber + 1)}
            disabled={pageNumber >= numPages}
            className="disabled:opacity-30"
          >
            &rarr;
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>
            &minus;
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(2, s + 0.25))}>
            +
          </button>
          <a
            href={`/${bookId}`}
            className="text-gray-400 hover:text-white ml-2"
          >
            {progress}% &times;
          </a>
        </div>
      </header>
      <div className="flex-1 overflow-auto bg-gray-800 flex justify-center">
        <Document
          file={bookUrl}
          onLoadSuccess={onLoadSuccess}
          loading={
            <div className="text-white p-8">Carregando PDF...</div>
          }
          error={
            <div className="text-red-400 p-8">
              Erro ao carregar PDF. Verifique se o arquivo existe e tente
              novamente.
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      </div>
    </div>
  );
}
