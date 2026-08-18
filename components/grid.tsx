'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SearchXIcon } from 'lucide-react';
import type { GridBook } from '@/lib/db/queries';
import { Photo } from './photo';
import { BookCaption } from './book-caption';
import { Button } from '@/components/ui/button';
import { EmptyState } from './empty-state';
import { SearchParams, stringifySearchParams } from '@/lib/url-state';

interface Biblioteca {
  id: number;
  name: string;
}

export function BooksGrid({
  books,
  searchParams,
  bibliotecas,
}: {
  books: GridBook[];
  searchParams: SearchParams;
  bibliotecas: Biblioteca[];
}) {
  const router = useRouter();
  const [selecionando, setSelecionando] = useState(false);
  // A seleção vive só nesta página (AD-5): paginar limpa, e é assim de
  // propósito — estado que sobrevive à navegação falha de formas sutis.
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  // Marca otimista de "na fila": o selo aparece antes de o refresh trazer o
  // estado real. O efeito abaixo a limpa quando a grade nova chega.
  const [filaLocal, setFilaLocal] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const primeiraGrade = useRef(true);

  // Depois de cada refresh, `books` é a fonte da verdade: a marca local só
  // existe para encurtar a espera, e mentir depois disso confundiria — um
  // livro tirado da fila na página dele voltaria a aparecer marcado aqui.
  useEffect(() => {
    if (primeiraGrade.current) {
      primeiraGrade.current = false;
      return;
    }
    setFilaLocal(new Set());
  }, [books]);

  function alternar(id: number) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function sair() {
    setSelecionando(false);
    setSelecionados(new Set());
    setAviso(null);
  }

  async function adicionar(bibliotecaId: number) {
    if (selecionados.size === 0) return;
    setAviso(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/collections/${bibliotecaId}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookIds: [...selecionados] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAviso(data?.error ?? 'Não foi possível adicionar.');
        return;
      }
      // Repetidos contam zero e isso não é erro (AD-6) — dizer quantos
      // entraram de fato evita a impressão de que a ação falhou.
      const n = Number(data?.adicionados ?? 0);
      setAviso(
        n === 0
          ? 'Esses livros já estavam na biblioteca.'
          : `${n} livro(s) adicionado(s).`
      );
      setSelecionados(new Set());
      // Sem recarregar a página: o refresh refaz os Server Components e a
      // grade passa a refletir o que o banco gravou.
      router.refresh();
    } catch {
      setAviso('Falha de rede ao adicionar.');
    } finally {
      setSalvando(false);
    }
  }

  async function porNaFila() {
    if (selecionados.size === 0) return;
    setAviso(null);
    setSalvando(true);
    const ids = [...selecionados];
    // Otimista: o selo aparece na hora; o refresh e o aviso corrigem o que
    // o banco recusou.
    setFilaLocal(new Set(ids));
    try {
      // Uma chamada por livro: a rota de livro já sabe recusar o que não é
      // possuído, e a seleção aqui é de punhado, não de acervo inteiro.
      const respostas = await Promise.all(
        ids.map((id) =>
          fetch(`/api/books/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nextUp: true }),
          })
        )
      );
      // Só os aprovados seguram a marca local; os recusados voltam ao que o
      // servidor diz (ou seja, sem selo).
      setFilaLocal(new Set(ids.filter((_, i) => respostas[i].ok)));
      const ok = respostas.filter((r) => r.ok).length;
      const recusados = respostas.length - ok;
      setAviso(
        recusados === 0
          ? `${ok} livro(s) na fila.`
          : `${ok} na fila; ${recusados} recusado(s) — você ainda não tem esses.`
      );
      setSelecionados(new Set());
      router.refresh();
    } catch {
      setFilaLocal(new Set());
      setAviso('Falha de rede ao pôr na fila.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      {/* A seleção agora serve também à fila, então não depende mais de
          existir alguma biblioteca criada. */}
      <div className="mb-3 flex items-center gap-3">
        {selecionando ? (
          <Button type="button" variant="outline" size="sm" onClick={sair}>
            Cancelar seleção
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelecionando(true)}
          >
            Selecionar
          </Button>
        )}
        {aviso && <span className="text-sm text-muted-foreground">{aviso}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
        {!books?.length ? (
          <div className="col-span-full">
            <EmptyState
              icone={SearchXIcon}
              titulo="Nenhum livro encontrado"
              descricao="Tente ajustar a busca ou os filtros."
              acao={
                <Button type="button" variant="outline" size="sm" onClick={() => router.push('/')}>
                  Ver todos os livros
                </Button>
              }
            />
          </div>
        ) : (
          books.map((book, index) => {
            const marcado = selecionados.has(book.id);
            const capa = (
              <Photo
                src={book.image_url}
                title={book.title}
                thumbhash={book.thumbhash}
                priority={index < 10}
                readStatus={book.read_status}
                myRating={book.my_rating}
                owned={book.owned}
                // filaLocal sobrepõe enquanto o refresh não confirma — ver
                // porNaFila acima.
                nextUp={book.next_up || filaLocal.has(book.id)}
                favorite={book.favorite}
              />
            );
            const legenda = (
              <BookCaption titulo={book.title} autores={book.authors} />
            );

            if (selecionando) {
              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => alternar(book.id)}
                  aria-pressed={marcado}
                  className={`relative block rounded-md text-left ${
                    marcado ? 'ring-2 ring-offset-2 ring-primary' : ''
                  }`}
                >
                  {capa}
                  {legenda}
                  <span
                    aria-hidden
                    className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                      marcado
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-white/70 bg-black/40 text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                </button>
              );
            }

            return (
              <Link
                href={`/${book.id}?${stringifySearchParams(searchParams)}`}
                key={book.id}
                className="block transition ease-in-out md:hover:scale-105"
                // Sempre pré-carrega (default): a página do livro é dinâmica,
                // e o payload pré-carregado cobre a transição com o loading
                // em vez de esperar o round-trip começar do zero no clique.
                prefetch
              >
                {capa}
                {legenda}
              </Link>
            );
          })
        )}
      </div>

      {selecionando && (
        // Barra no rodapé: o uso principal é no celular, onde é o polegar
        // que alcança.
        <div className="fixed inset-x-0 bottom-14 z-20 border-t bg-card p-3 shadow-lg md:bottom-0">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {selecionados.size} selecionado(s)
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={salvando || selecionados.size === 0}
                onClick={() => void porNaFila()}
              >
                Ler em seguida
              </Button>
              {bibliotecas.map((b) => (
                <Button
                  key={b.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={salvando || selecionados.size === 0}
                  onClick={() => void adicionar(b.id)}
                >
                  {b.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
