'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LivroDesejado {
  id: number;
  title: string;
  publication_year: number | null;
  num_pages: number | null;
  createdAt: Date | string;
}

interface WishlistClientProps {
  initial: LivroDesejado[];
}

interface Note {
  id: string;
}

export function WishlistClient({ initial }: WishlistClientProps) {
  const router = useRouter();

  const [titulo, setTitulo] = useState('');
  const [autor, setAutor] = useState('');
  const [ano, setAno] = useState('');
  const [paginas, setPaginas] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

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

  async function jaTenho(livro: LivroDesejado) {
    setErro(null);
    setRemovingId(livro.id);
    try {
      let quantidadeNotas = 0;
      try {
        const notesRes = await fetch(`/api/books/${livro.id}/notes`);
        if (notesRes.ok) {
          const notas = (await notesRes.json()) as Note[];
          quantidadeNotas = notas.length;
        }
      } catch {
        // Se a checagem de notas falhar, seguimos sem confirmação extra —
        // a falha de rede não pode impedir o fluxo principal.
      }

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
      </div>

      {initial.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum livro na lista de desejados ainda.</p>
      ) : (
        <ul className="space-y-3">
          {initial.map((livro) => (
            <li
              key={livro.id}
              className="border rounded-md p-3 flex items-center justify-between gap-3"
            >
              <div>
                <p className="font-medium">{livro.title}</p>
                <p className="text-sm text-gray-500">
                  {[livro.publication_year, livro.num_pages ? `${livro.num_pages} páginas` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void jaTenho(livro)}
                disabled={removingId === livro.id}
              >
                Já tenho
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
