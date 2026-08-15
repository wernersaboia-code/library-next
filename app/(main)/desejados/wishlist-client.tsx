'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Photo } from '@/components/photo';

interface LivroDesejado {
  id: number;
  title: string;
  publication_year: number | null;
  num_pages: number | null;
  createdAt: Date | string;
  authors: string[] | null;
  image_url: string | null;
  thumbhash: string | null;
  average_rating: string | null;
  ratings_count: number | null;
}

interface WishlistClientProps {
  initial: LivroDesejado[];
}

interface Note {
  id: string;
  kind: string;
  note: string | null;
}

interface Candidato {
  title: string;
  author: string | null;
  publicationYear: number | null;
  numPages: number | null;
  coverId: number | null;
  ratingsAverage: number | null;
  ratingsCount: number | null;
}

/**
 * Nota nunca aparece sem o número de votos (AD-3): sem avaliação devolve
 * null, e cabe a quem chama decidir entre "sem avaliações" e não mostrar nada.
 */
function formatarNota(
  media: number | string | null,
  votos: number | null
): string | null {
  if (media === null || votos === null) return null;
  const n = Number(media);
  if (!Number.isFinite(n)) return null;
  const nota = n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const plural = votos === 1 ? 'voto' : 'votos';
  return `${nota} ★ · ${votos.toLocaleString('pt-BR')} ${plural}`;
}

export function WishlistClient({ initial }: WishlistClientProps) {
  const router = useRouter();

  const [titulo, setTitulo] = useState('');
  const [tituloOriginal, setTituloOriginal] = useState('');
  const [autor, setAutor] = useState('');
  const [ano, setAno] = useState('');
  const [paginas, setPaginas] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [erroBusca, setErroBusca] = useState<string | null>(null);

  async function buscarExterno() {
    const termo = busca.trim();
    if (!termo) {
      setErroBusca('Informe o que buscar.');
      return;
    }

    setErroBusca(null);
    setCandidatos(null);
    setBuscando(true);
    try {
      const res = await fetch(
        `/api/books/search-external?q=${encodeURIComponent(termo)}`
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // A busca externa nunca bloqueia: o formulário manual segue utilizável.
        setErroBusca(
          data?.error ?? 'Não foi possível buscar agora. Preencha manualmente.'
        );
        return;
      }
      setCandidatos((data?.resultados ?? []) as Candidato[]);
    } catch {
      setErroBusca('Não foi possível buscar agora. Preencha manualmente.');
    } finally {
      setBuscando(false);
    }
  }

  async function escolher(candidato: Candidato) {
    setErroBusca(null);
    setAviso(null);
    setIsSaving(true);
    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: candidato.title,
          authors: candidato.author ? [candidato.author] : undefined,
          publicationYear: candidato.publicationYear ?? undefined,
          numPages: candidato.numPages ?? undefined,
          averageRating: candidato.ratingsAverage ?? undefined,
          ratingsCount: candidato.ratingsCount ?? undefined,
          owned: false,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErroBusca(data?.error ?? 'Não foi possível adicionar o livro.');
        return;
      }

      // O cliente manda só o id numérico da capa; quem monta a URL é o
      // servidor. Falha aqui não desfaz o livro — ele já está na lista.
      if (candidato.coverId !== null && typeof data?.bookId === 'number') {
        try {
          const capaRes = await fetch(`/api/books/${data.bookId}/cover`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coverId: candidato.coverId }),
          });
          if (!capaRes.ok) {
            setAviso('Livro adicionado, mas a capa não pôde ser baixada.');
          }
        } catch {
          setAviso('Livro adicionado, mas a capa não pôde ser baixada.');
        }
      }

      setBusca('');
      setCandidatos(null);
      router.refresh();
    } catch {
      setErroBusca('Falha de rede ao adicionar o livro.');
    } finally {
      setIsSaving(false);
    }
  }

  async function adicionar() {
    const tituloAparado = titulo.trim();
    if (!tituloAparado) {
      setErro('O título é obrigatório.');
      return;
    }

    setErro(null);
    setIsSaving(true);
    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: tituloAparado,
          originalTitle: tituloOriginal.trim() || undefined,
          authors: autor.trim() ? [autor.trim()] : undefined,
          publicationYear: ano.trim() || undefined,
          numPages: paginas.trim() || undefined,
          owned: false,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível adicionar o livro.');
        return;
      }
      setTitulo('');
      setTituloOriginal('');
      setAutor('');
      setAno('');
      setPaginas('');
      router.refresh();
    } catch {
      setErro('Falha de rede ao adicionar o livro.');
    } finally {
      setIsSaving(false);
    }
  }

  // O nome anterior ("Já tenho") prometia mover o livro para o acervo, mas a
  // ação sempre foi apagar. O rótulo agora diz o que acontece.
  async function apagar(livro: LivroDesejado) {
    setErro(null);
    setRemovingId(livro.id);
    try {
      // Ação destrutiva e irreversível: se não conseguirmos saber se há
      // notas, falhamos fechado (abortamos) em vez de apagar sem avisar.
      let notesRes: Response;
      try {
        notesRes = await fetch(`/api/books/${livro.id}/notes`);
      } catch {
        setErro('Não foi possível verificar as notas deste livro. Tente novamente.');
        return;
      }

      if (!notesRes.ok) {
        setErro('Não foi possível verificar as notas deste livro. Tente novamente.');
        return;
      }

      const notas = (await notesRes.json()) as Note[];
      const quantidadeNotas = notas.length;

      if (quantidadeNotas > 0) {
        const confirmado = confirm(
          `Este livro tem ${quantidadeNotas} nota(s). Apagar mesmo?`
        );
        if (!confirmado) return;
      }

      const res = await fetch(`/api/books/${livro.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível remover o livro.');
        return;
      }
      router.refresh();
    } catch {
      setErro('Falha de rede ao remover o livro.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-md p-4 space-y-3">
        <h2 className="text-lg font-semibold">Adicionar à lista</h2>

        <div>
          <Label className="block mb-1" htmlFor="wishlist-busca">
            Buscar na Open Library
          </Label>
          <div className="flex gap-2">
            <Input
              id="wishlist-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void buscarExterno();
                }
              }}
              placeholder="Título ou autor"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void buscarExterno()}
              disabled={buscando}
            >
              {buscando ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
          {erroBusca && <p className="mt-1 text-sm text-red-600">{erroBusca}</p>}
          {candidatos !== null && candidatos.length === 0 && (
            <p className="mt-1 text-sm text-gray-500">
              Nada encontrado — preencha manualmente.
            </p>
          )}
        </div>

        {candidatos !== null && candidatos.length > 0 && (
          <ul className="space-y-2">
            {candidatos.map((c, i) => {
              const nota = formatarNota(c.ratingsAverage, c.ratingsCount);
              return (
                <li
                  key={`${c.title}-${c.coverId ?? i}`}
                  className="flex items-start gap-3 border rounded-md p-2"
                >
                  {c.coverId !== null ? (
                    // Miniatura efêmera de pré-visualização: `img` simples em
                    // vez de next/image, para não liberar um host externo no
                    // otimizador. A capa definitiva vem do nosso Storage.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://covers.openlibrary.org/b/id/${c.coverId}-M.jpg`}
                      alt=""
                      className="h-20 w-14 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-20 w-14 shrink-0 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.title}</p>
                    <p className="text-sm text-gray-500">
                      {[c.author, c.publicationYear].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-sm text-gray-500">
                      {nota ?? 'sem avaliações'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void escolher(c)}
                    disabled={isSaving}
                  >
                    Escolher
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="block mb-1" htmlFor="wishlist-titulo">
              Título *
            </Label>
            <Input
              id="wishlist-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título do livro"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="block mb-1" htmlFor="wishlist-titulo-original">
              Título original
            </Label>
            <Input
              id="wishlist-titulo-original"
              value={tituloOriginal}
              onChange={(e) => setTituloOriginal(e.target.value)}
              placeholder="Título em língua original (opcional)"
            />
          </div>
          <div>
            <Label className="block mb-1" htmlFor="wishlist-autor">
              Autor
            </Label>
            <Input
              id="wishlist-autor"
              value={autor}
              onChange={(e) => setAutor(e.target.value)}
              placeholder="Autor (opcional)"
            />
          </div>
          <div>
            <Label className="block mb-1" htmlFor="wishlist-ano">
              Ano
            </Label>
            <Input
              id="wishlist-ano"
              type="number"
              value={ano}
              onChange={(e) => setAno(e.target.value)}
              placeholder="Ano (opcional)"
            />
          </div>
          <div>
            <Label className="block mb-1" htmlFor="wishlist-paginas">
              Páginas
            </Label>
            <Input
              id="wishlist-paginas"
              type="number"
              value={paginas}
              onChange={(e) => setPaginas(e.target.value)}
              placeholder="Páginas (opcional)"
            />
          </div>
        </div>
        <Button type="button" onClick={() => void adicionar()} disabled={isSaving}>
          Adicionar
        </Button>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {aviso && <p className="text-sm text-amber-600">{aviso}</p>}
      </div>

      {initial.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum livro na lista de desejados ainda.</p>
      ) : (
        <ul className="space-y-3">
          {initial.map((livro) => (
            <ItemDesejado
              key={livro.id}
              livro={livro}
              removendo={removingId === livro.id}
              onApagar={() => void apagar(livro)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemDesejado({
  livro,
  removendo,
  onApagar,
}: {
  livro: LivroDesejado;
  removendo: boolean;
  onApagar: () => void;
}) {
  const router = useRouter();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [enviandoCapa, setEnviandoCapa] = useState(false);
  const [erroCapa, setErroCapa] = useState<string | null>(null);

  // Sem nota, o item não diz nada: "sem avaliações" em cada linha seria
  // ruído — essa informação importa na hora de escolher, não depois.
  const nota = formatarNota(livro.average_rating, livro.ratings_count);

  async function enviarCapa(arquivo: File) {
    setErroCapa(null);
    setEnviandoCapa(true);
    try {
      const form = new FormData();
      form.append('file', arquivo);
      const res = await fetch(`/api/books/${livro.id}/cover`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErroCapa(data?.error ?? 'Não foi possível enviar a capa.');
        return;
      }
      router.refresh();
    } catch {
      setErroCapa('Falha de rede ao enviar a capa.');
    } finally {
      setEnviandoCapa(false);
    }
  }

  return (
    <li className="border rounded-md p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-14 shrink-0">
            <Photo
              src={livro.image_url}
              title={livro.title}
              thumbhash={livro.thumbhash}
              priority={false}
            />
          </div>
          <div className="min-w-0">
            <p className="font-medium">{livro.title}</p>
            <p className="text-sm text-gray-500">
              {[
                livro.authors && livro.authors.length > 0
                  ? livro.authors.join(', ')
                  : null,
                livro.publication_year,
                livro.num_pages ? `${livro.num_pages} páginas` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {nota && <p className="text-sm text-gray-500">{nota}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputArquivo.current?.click()}
            disabled={enviandoCapa}
          >
            {enviandoCapa ? 'Enviando...' : 'Enviar capa'}
          </Button>
          <input
            ref={inputArquivo}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              // Limpa o valor para que escolher o mesmo arquivo de novo
              // continue disparando o onChange.
              e.target.value = '';
              if (arquivo) void enviarCapa(arquivo);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onApagar}
            disabled={removendo}
          >
            {removendo ? 'Apagando...' : 'Apagar'}
          </Button>
        </div>
      </div>

      {erroCapa && <p className="text-sm text-red-600">{erroCapa}</p>}

      <ComentarioLivro bookId={livro.id} />
    </li>
  );
}

/**
 * Um comentário por livro desejado, gravado como highlight `kind: 'note'`
 * (AD-8) — o mesmo formato usado na página do livro.
 */
function ComentarioLivro({ bookId }: { bookId: number }) {
  const [comentario, setComentario] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await fetch(`/api/books/${bookId}/notes`);
        if (!res.ok) {
          if (ativo) setErro('Não foi possível carregar o comentário.');
          return;
        }
        const notas = (await res.json()) as Note[];
        const existente = notas.find((n) => n.kind === 'note');
        if (!ativo) return;
        if (existente) {
          setNoteId(existente.id);
          setComentario(existente.note ?? '');
        }
      } catch {
        if (ativo) setErro('Falha de rede ao carregar o comentário.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [bookId]);

  async function salvar() {
    const texto = comentario.trim();
    if (!texto) {
      setErro('Escreva algo antes de salvar.');
      return;
    }

    setErro(null);
    setSalvando(true);
    try {
      const res = noteId
        ? await fetch(`/api/books/${bookId}/notes`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ noteId, note: texto }),
          })
        : await fetch(`/api/books/${bookId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'note', note: texto }),
          });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível salvar o comentário.');
        return;
      }
      if (!noteId && typeof data?.id === 'string') setNoteId(data.id);
    } catch {
      setErro('Falha de rede ao salvar o comentário.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="block" htmlFor={`comentario-${bookId}`}>
        Comentário
      </Label>
      <textarea
        id={`comentario-${bookId}`}
        className="flex w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder={carregando ? 'Carregando...' : 'Por que você quer este livro?'}
        disabled={carregando}
      />
      <Button
        type="button"
        size="sm"
        onClick={() => void salvar()}
        disabled={salvando || carregando}
      >
        {salvando ? 'Salvando...' : 'Salvar comentário'}
      </Button>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
