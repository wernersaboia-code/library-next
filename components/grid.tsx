'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Book } from '@/lib/db/schema';
import { Photo } from './photo';
import { Button } from '@/components/ui/button';
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
  books: Book[];
  searchParams: SearchParams;
  bibliotecas: Biblioteca[];
}) {
  const [selecionando, setSelecionando] = useState(false);
  // A seleção vive só nesta página (AD-5): paginar limpa, e é assim de
  // propósito — estado que sobrevive à navegação falha de formas sutis.
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

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
    } catch {
      setAviso('Falha de rede ao adicionar.');
    } finally {
      setSalvando(false);
    }
  }

  const noFilters = Object.values(searchParams).every((v) => v === undefined);

  return (
    <div>
      {bibliotecas.length > 0 && (
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
          {aviso && <span className="text-sm text-gray-500">{aviso}</span>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
        {!books?.length ? (
          <p className="text-center text-muted-foreground col-span-full">
            Nenhum livro encontrado.
          </p>
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
              />
            );

            if (selecionando) {
              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => alternar(book.id)}
                  aria-pressed={marcado}
                  className={`relative block rounded-md text-left ${
                    marcado ? 'ring-2 ring-offset-2 ring-sky-600' : ''
                  }`}
                >
                  {capa}
                  <span
                    aria-hidden
                    className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                      marcado
                        ? 'border-sky-600 bg-sky-600 text-white'
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
                prefetch={noFilters ? true : null}
              >
                {capa}
              </Link>
            );
          })
        )}
      </div>

      {selecionando && (
        // Barra no rodapé: o uso principal é no celular, onde é o polegar
        // que alcança.
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-3 shadow-lg dark:bg-gray-800">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {selecionados.size} selecionado(s)
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
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
