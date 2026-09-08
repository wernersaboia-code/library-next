'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { DocumentProps, PageProps } from 'react-pdf';
import Link from 'next/link';
import { ArrowLeftIcon, Loader2Icon } from 'lucide-react';

type FileInfo = { url: string; format: 'epub' | 'pdf'; mime: string };

export function ReaderClient({ bookId, title }: { bookId: number; title: string }) {
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await fetch(`/api/books/${bookId}/file`);
        const data = await res.json().catch(() => null);
        if (!ativo) return;
        if (!res.ok) {
          setError(data?.error ?? 'Não foi possível abrir o arquivo.');
          return;
        }
        setInfo({ url: data.url, format: data.format, mime: data.mime });
      } catch {
        if (ativo) setError('Falha de rede ao abrir o arquivo.');
      }
    })();
    return () => {
      ativo = false;
    };
  }, [bookId]);

  const [selecao, setSelecao] = useState<{ texto: string; x: number; y: number } | null>(null);
  const [traducao, setTraducao] = useState<string | null>(null);
  const [traduzindo, setTraduzindo] = useState(false);
  const [erroTraducao, setErroTraducao] = useState<string | null>(null);

  useEffect(() => {
    function capturar() {
      const sel = window.getSelection();
      const texto = sel?.toString().trim() ?? '';
      if (!texto || texto.length > 5000) {
        setSelecao(null);
        return;
      }
      const range = sel?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      setSelecao({
        texto,
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top : window.innerHeight - 80,
      });
    }
    document.addEventListener('mouseup', capturar);
    document.addEventListener('touchend', capturar);
    return () => {
      document.removeEventListener('mouseup', capturar);
      document.removeEventListener('touchend', capturar);
    };
  }, []);

  async function traduzir() {
    if (!selecao) return;
    setTraduzindo(true);
    setErroTraducao(null);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selecao.texto }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErroTraducao(data?.error ?? 'Não foi possível traduzir.');
        return;
      }
      setTraducao(data.translated);
    } catch {
      setErroTraducao('Falha de rede ao traduzir.');
    } finally {
      setTraduzindo(false);
    }
  }

  const [destacado, setDestacado] = useState<string | null>(null);

  async function salvarProgresso(percentual: number) {
    try {
      await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressPercent: Math.round(percentual) }),
      });
    } catch {
      // progresso é best-effort: falha silenciosa não interrompe a leitura.
    }
  }

  async function destacar() {
    if (!selecao || !info) return;
    setDestacado(null);
    try {
      const res = await fetch(`/api/books/${bookId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'highlight',
          textContent: selecao.texto,
          locator: { source: info.format },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setDestacado(data?.error ?? 'Não foi possível salvar o destaque.');
        return;
      }
      setDestacado('Destaque salvo.');
      setSelecao(null);
    } catch {
      setDestacado('Falha de rede ao salvar o destaque.');
    }
  }

  return (
    <div className="relative flex h-full flex-col bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <Link
          href={`/${bookId}`}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden /> Voltar
        </Link>
        <span className="truncate font-display text-base font-semibold">{title}</span>
      </div>

      {error && (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p role="alert" className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {!info && !error && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">Carregando</span>
        </div>
      )}

      {info?.format === 'epub' && <EpubView src={info.url} onProgress={salvarProgresso} />}
      {info?.format === 'pdf' && <PdfView src={info.url} onProgress={salvarProgresso} />}

      {selecao && !traducao && (
        <div
          className="fixed z-40 flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg ring-1 ring-white/30"
          style={{ left: selecao.x, top: selecao.y - 46, transform: 'translate(-50%, -100%)' }}
        >
          <button
            type="button"
            onClick={() => void traduzir()}
            disabled={traduzindo}
            className="hover:opacity-90"
          >
            {traduzindo ? 'Traduzindo…' : 'Traduzir'}
          </button>
          <span className="h-4 w-px bg-primary-foreground/30" aria-hidden />
          <button type="button" onClick={() => void destacar()} className="hover:opacity-90">
            Destacar
          </button>
        </div>
      )}

      {destacado && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl border-t border-border bg-card px-4 py-3 text-sm shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <span role="status">{destacado}</span>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              onClick={() => setDestacado(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {traducao && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl border-t border-border bg-card p-4 shadow-2xl">
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="text-sm font-medium">Tradução</p>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              onClick={() => {
                setTraducao(null);
                setSelecao(null);
              }}
            >
              Fechar
            </button>
          </div>
          <p className="max-h-64 overflow-auto text-sm">{traducao}</p>
          {erroTraducao && <p role="alert" className="mt-2 text-sm text-red-600">{erroTraducao}</p>}
        </div>
      )}
    </div>
  );
}

function EpubView({ src, onProgress }: { src: string; onProgress: (p: number) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!container.current) return;
    let livro: import('epubjs').Book | null = null;
    let aberto = true;

    (async () => {
      try {
        const ePub = (await import('epubjs')).default;
        livro = ePub(src);
        await livro.ready;
        if (!aberto || !container.current) return;
        const rendition = livro.renderTo(container.current, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          spread: 'none',
        });
        await rendition.display();

        try {
          await livro.locations.generate(1000);
        } catch {
          // sem locations o progresso fica sem %, mas a leitura continua.
        }

        rendition.on('relocated', (location: { start?: { cfi?: string } }) => {
          const cfi = location?.start?.cfi;
          if (cfi && livro?.locations && livro.locations.length()) {
            onProgress(livro.locations.percentageFromCfi(cfi) * 100);
          }
        });
      } catch {
        if (aberto) setErro('Não foi possível renderizar o EPUB.');
      }
    })();

    return () => {
      aberto = false;
      livro?.destroy();
    };
  }, [src, onProgress]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div ref={container} className="h-full w-full" />
      {erro && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p role="alert" className="text-sm text-red-600">{erro}</p>
        </div>
      )}
    </div>
  );
}

function PdfView({ src, onProgress }: { src: string; onProgress: (p: number) => void }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (numPages && numPages > 0) {
      onProgress((page / numPages) * 100);
    }
  }, [page, numPages, onProgress]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-center gap-3 border-b border-border px-4 py-2 text-sm">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Anterior
        </button>
        <span>
          {page} / {numPages ?? '…'}
        </span>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          disabled={numPages !== null && page >= numPages}
          onClick={() => setPage((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}
        >
          Próxima
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <PdfInner
          src={src}
          page={page}
          onNumPages={setNumPages}
          onErro={setErro}
        />
      </div>

      {erro && (
        <div className="flex justify-center px-6 py-2">
          <p role="alert" className="text-sm text-red-600">{erro}</p>
        </div>
      )}
    </div>
  );
}

function PdfInner({
  src, page, onNumPages, onErro,
}: {
  src: string;
  page: number;
  onNumPages: (n: number) => void;
  onErro: (e: string) => void;
}) {
  const [Document, setDocument] = useState<ComponentType<DocumentProps> | null>(null);
  const [Page, setPageC] = useState<ComponentType<PageProps> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const mod = await import('react-pdf');
      mod.pdfjs.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs';
      if (!mounted) return;
      setDocument(mod.Document);
      setPageC(mod.Page);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!Document || !Page) return null;

  return (
    <Document
      file={src}
      onLoadSuccess={(d: { numPages: number }) => onNumPages(d.numPages)}
      onLoadError={() => onErro('Não foi possível renderizar o PDF.')}
      className="flex justify-center py-4"
    >
      <Page pageNumber={page} renderTextLayer renderAnnotationLayer={false} />
    </Document>
  );
}
