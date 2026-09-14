'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import type { DocumentProps, PageProps } from 'react-pdf';
import Link from 'next/link';
import { ArrowLeftIcon, BookmarkIcon, XIcon, Loader2Icon, DownloadIcon, CheckIcon } from 'lucide-react';
import type { Bookmark } from '@/lib/db/bookmarks';
import { lerLivro, salvarLivro, pedirPersistencia } from '@/lib/offline/books';
import { useOffline } from '@/components/offline-provider';

type FileInfo = {
  format: 'epub' | 'pdf';
  mime?: string;
  url?: string;
  data?: ArrayBuffer;
  offline?: boolean;
};

export type Locator =
  | { format: 'epub'; cfi: string; href?: string }
  | { format: 'pdf'; page: number };

/** Interpreta um locator vindo do servidor (jsonb) ou da URL. */
function parseLocator(v: unknown): Locator | null {
  if (!v || typeof v !== 'object') return null;
  const l = v as Record<string, unknown>;
  if (l.format === 'epub' && typeof l.cfi === 'string' && l.cfi) {
    return {
      format: 'epub',
      cfi: l.cfi,
      ...(typeof l.href === 'string' && l.href ? { href: l.href } : {}),
    };
  }
  if (l.format === 'pdf') {
    const page = Number(l.page);
    if (Number.isInteger(page) && page > 0) return { format: 'pdf', page };
  }
  return null;
}

/** Locator vindo da URL (?cfi= ou ?page=) para deep-link de um marcador. */
function locatorDaUrl(): Locator | null {
  if (typeof window === 'undefined') return null;
  const sp = new URLSearchParams(window.location.search);
  const cfi = sp.get('cfi');
  if (cfi) return { format: 'epub', cfi };
  const page = sp.get('page');
  if (page) return parseLocator({ format: 'pdf', page });
  return null;
}

function rotuloDoLocator(locator: Locator, percentual: number | null): string {
  if (locator.format === 'pdf') return `Página ${locator.page}`;
  return percentual !== null ? `${Math.round(percentual)}%` : 'Marcador';
}

export function ReaderClient({
  bookId,
  title,
  translationEnabled,
  initialLocator,
  initialBookmarks,
}: {
  bookId: number;
  title: string;
  translationEnabled: boolean;
  initialLocator: unknown;
  initialBookmarks: Bookmark[];
}) {
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        // Offline primeiro: o arquivo baixado evita a signed URL (que expira).
        const offline = await lerLivro(bookId).catch(() => undefined);
        if (!ativo) return;
        if (offline) {
          setInfo({ format: offline.format, data: offline.data, offline: true });
          return;
        }
        const res = await fetch(`/api/books/${bookId}/file`);
        const data = await res.json().catch(() => null);
        if (!ativo) return;
        if (!res.ok) {
          setError(data?.error ?? 'Não foi possível abrir o arquivo.');
          return;
        }
        if (data.format === 'epub') {
          // O epubjs, ao receber uma URL com `?token=...` (signed URL),
          // interpreta como EPUB "em diretório" e vai buscar
          // META-INF/container.xml no Storage (404 → erro de parse XML).
          // Baixamos o arquivo e entregamos o ArrayBuffer, como no offline.
          const buf = await (await fetch(data.url)).arrayBuffer();
          if (!ativo) return;
          setInfo({ format: 'epub', data: buf });
        } else {
          setInfo({ url: data.url, format: data.format, mime: data.mime });
        }
      } catch {
        if (ativo) setError('Falha de rede ao abrir o arquivo.');
      }
    })();
    return () => {
      ativo = false;
    };
  }, [bookId]);

  // ─── Download para leitura offline ───────────────────────────
  const { atualizar: atualizarOffline } = useOffline();
  const [baixando, setBaixando] = useState(false);
  const [offlineMsg, setOfflineMsg] = useState<string | null>(null);

  async function baixarOffline() {
    setBaixando(true);
    setOfflineMsg(null);
    try {
      const res = await fetch(`/api/books/${bookId}/file`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setOfflineMsg(data?.error ?? 'Não foi possível baixar o arquivo.');
        return;
      }
      const fileRes = await fetch(data.url);
      if (!fileRes.ok) {
        setOfflineMsg('Falha ao baixar o arquivo.');
        return;
      }
      const buf = await fileRes.arrayBuffer();
      await salvarLivro({
        bookId,
        title,
        format: data.format,
        data: buf,
        size: buf.byteLength,
        savedAt: Date.now(),
      });
      await pedirPersistencia();
      setInfo({ format: data.format, data: buf, offline: true });
      await atualizarOffline();
      setOfflineMsg('Salvo para leitura offline.');
    } catch {
      setOfflineMsg('Falha de rede ao baixar o arquivo.');
    } finally {
      setBaixando(false);
    }
  }

  // ─── Posição / retomar ───────────────────────────────────────
  const [posicao, setPosicao] = useState<Locator | null>(null);
  const [percentual, setPercentual] = useState<number | null>(null);
  const [jumpTo, setJumpTo] = useState<Locator | null>(null);

  // O locator inicial é o da URL (deep-link de bookmark), que vence o
  // `last_locator` gravado no livro.
  const locatorInicialRef = useRef<Locator | null>(null);
  if (locatorInicialRef.current === null) {
    locatorInicialRef.current = locatorDaUrl() ?? parseLocator(initialLocator);
  }

  const pendente = useRef<{ percentual?: number; locator?: Locator }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agendarSalvar = useCallback(
    (dados: { percentual?: number; locator?: Locator }) => {
      pendente.current = { ...pendente.current, ...dados };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const body: Record<string, unknown> = {};
        if (pendente.current.percentual !== undefined) {
          body.progressPercent = Math.round(pendente.current.percentual);
        }
        if (pendente.current.locator !== undefined) {
          body.locator = pendente.current.locator;
        }
        pendente.current = {};
        if (Object.keys(body).length === 0) return;
        // Best-effort: falha de progresso não interrompe a leitura.
        void fetch(`/api/books/${bookId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => {});
      }, 800);
    },
    [bookId]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const registrarPosicao = useCallback(
    (pct: number, locator: Locator) => {
      setPosicao(locator);
      setPercentual(pct);
      agendarSalvar({ percentual: pct, locator });
    },
    [agendarSalvar]
  );

  // ─── Marcadores ──────────────────────────────────────────────
  const [marcadores, setMarcadores] = useState<Bookmark[]>(initialBookmarks);
  const [painel, setPainel] = useState(false);
  const [salvandoMarcador, setSalvandoMarcador] = useState(false);
  const [erroMarcador, setErroMarcador] = useState<string | null>(null);

  async function recarregarMarcadores() {
    const res = await fetch(`/api/books/${bookId}/bookmarks`);
    if (res.ok) setMarcadores((await res.json()) as Bookmark[]);
  }

  async function marcarPagina() {
    if (!posicao) {
      setErroMarcador('Posição ainda não disponível.');
      return;
    }
    setSalvandoMarcador(true);
    setErroMarcador(null);
    try {
      const res = await fetch(`/api/books/${bookId}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locator: posicao,
          label: rotuloDoLocator(posicao, percentual),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErroMarcador(data?.error ?? 'Não foi possível marcar a página.');
        return;
      }
      await recarregarMarcadores();
      setPainel(true);
    } catch {
      setErroMarcador('Falha de rede ao marcar a página.');
    } finally {
      setSalvandoMarcador(false);
    }
  }

  async function apagarMarcador(bookmarkId: string) {
    setErroMarcador(null);
    try {
      const res = await fetch(`/api/books/${bookId}/bookmarks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarkId }),
      });
      if (!res.ok) {
        setErroMarcador('Não foi possível apagar o marcador.');
        return;
      }
      await recarregarMarcadores();
    } catch {
      setErroMarcador('Falha de rede ao apagar o marcador.');
    }
  }

  function irPara(locator: Locator) {
    const parsed = parseLocator(locator);
    if (!parsed) return;
    setJumpTo(parsed);
    setPainel(false);
  }

  // ─── Tradução / destaque ─────────────────────────────────────
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
          locator: posicao ?? { source: info.format },
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
        <span className="min-w-0 flex-1 truncate font-display text-base font-semibold">
          {title}
        </span>
        <button
          type="button"
          onClick={() => void marcarPagina()}
          disabled={!posicao || salvandoMarcador}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <BookmarkIcon className="h-4 w-4" aria-hidden /> Marcar
        </button>
        <button
          type="button"
          onClick={() => setPainel((p) => !p)}
          aria-expanded={painel}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Marcadores{marcadores.length > 0 ? ` (${marcadores.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => void baixarOffline()}
          disabled={baixando || info?.offline}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          {info?.offline ? (
            <CheckIcon className="h-4 w-4" aria-hidden />
          ) : (
            <DownloadIcon className="h-4 w-4" aria-hidden />
          )}
          {info?.offline ? 'Offline' : 'Baixar'}
        </button>
      </div>

      {offlineMsg && (
        <p role="status" className="px-4 py-1 text-xs text-muted-foreground">
          {offlineMsg}
        </p>
      )}

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

      {info?.format === 'epub' && (
        <EpubView
          source={info.data ?? info.url ?? ''}
          initialCfi={locatorInicialRef.current?.format === 'epub' ? locatorInicialRef.current.cfi : null}
          jumpTo={jumpTo}
          onPosition={registrarPosicao}
        />
      )}
      {info?.format === 'pdf' && (
        <PdfView
          source={info.data ?? info.url ?? ''}
          initialPage={locatorInicialRef.current?.format === 'pdf' ? locatorInicialRef.current.page : 1}
          jumpTo={jumpTo}
          onPosition={registrarPosicao}
        />
      )}

      {painel && (
        <aside className="absolute right-3 top-14 z-30 w-72 max-w-[85vw] rounded-xl border border-border bg-card p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Marcadores</h2>
            <button
              type="button"
              onClick={() => setPainel(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent"
              aria-label="Fechar marcadores"
            >
              <XIcon className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {erroMarcador && <p role="alert" className="mb-2 text-xs text-red-600">{erroMarcador}</p>}
          {marcadores.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum marcador ainda.</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-auto">
              {marcadores.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => irPara(m.locator as Locator)}
                    className="flex-1 truncate rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
                  >
                    {m.label ?? 'Marcador'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void apagarMarcador(m.id)}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-red-600"
                    aria-label={`Apagar marcador ${m.label ?? ''}`}
                  >
                    Apagar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      {selecao && !traducao && (
        <div
          className="fixed z-40 flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg ring-1 ring-white/30"
          style={{ left: selecao.x, top: selecao.y - 46, transform: 'translate(-50%, -100%)' }}
        >
          {translationEnabled && (
            <>
              <button
                type="button"
                onClick={() => void traduzir()}
                disabled={traduzindo}
                className="hover:opacity-90"
              >
                {traduzindo ? 'Traduzindo…' : 'Traduzir'}
              </button>
              <span className="h-4 w-px bg-primary-foreground/30" aria-hidden />
            </>
          )}
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

type OnPosition = (percentual: number, locator: Locator) => void;

function EpubView({
  source, initialCfi, jumpTo, onPosition,
}: {
  source: string | ArrayBuffer;
  initialCfi: string | null;
  jumpTo: Locator | null;
  onPosition: OnPosition;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const renditionRef = useRef<{ display: (target?: string) => unknown } | null>(null);
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;
  const initialCfiRef = useRef(initialCfi);
  initialCfiRef.current = initialCfi;

  useEffect(() => {
    if (!container.current) return;
    let livro: import('epubjs').Book | null = null;
    let aberto = true;

    (async () => {
      try {
        const ePub = (await import('epubjs')).default;
        livro = ePub(source);
        await livro.ready;
        if (!aberto || !container.current) return;
        const rendition = livro.renderTo(container.current, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          spread: 'none',
        });
        renditionRef.current = rendition;
        await rendition.display(initialCfiRef.current ?? undefined);

        try {
          await livro.locations.generate(1000);
        } catch {
          // sem locations o progresso fica sem %, mas a leitura continua.
        }

        rendition.on('relocated', (location: { start?: { cfi?: string; href?: string } }) => {
          const cfi = location?.start?.cfi;
          if (!cfi) return;
          let pct = 0;
          try {
            if (livro?.locations && livro.locations.length()) {
              pct = livro.locations.percentageFromCfi(cfi) * 100;
            }
          } catch {
            pct = 0;
          }
          onPositionRef.current(pct, {
            format: 'epub',
            cfi,
            ...(location?.start?.href ? { href: location.start.href } : {}),
          });
        });
      } catch {
        if (aberto) setErro('Não foi possível renderizar o EPUB.');
      }
    })();

    return () => {
      aberto = false;
      renditionRef.current = null;
      livro?.destroy();
    };
  }, [source]);

  useEffect(() => {
    if (jumpTo?.format === 'epub' && renditionRef.current) {
      void renditionRef.current.display(jumpTo.cfi);
    }
  }, [jumpTo]);

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

function PdfView({
  source, initialPage, jumpTo, onPosition,
}: {
  source: string | ArrayBuffer;
  initialPage: number;
  jumpTo: Locator | null;
  onPosition: OnPosition;
}) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [page, setPage] = useState(initialPage);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (numPages && numPages > 0) {
      const p = Math.min(page, numPages);
      onPosition((p / numPages) * 100, { format: 'pdf', page: p });
    }
  }, [page, numPages, onPosition]);

  useEffect(() => {
    if (jumpTo?.format === 'pdf') setPage(jumpTo.page);
  }, [jumpTo]);

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
          src={source}
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
  src: string | ArrayBuffer;
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
      // Worker self-hosted (public/): sem o CDN o PDF funciona offline.
      mod.pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
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
