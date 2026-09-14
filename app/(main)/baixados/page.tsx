'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { HardDriveDownloadIcon } from 'lucide-react';
import {
  listarLivros,
  removerLivro,
  usoArmazenamento,
  type OfflineBook,
  type UsoArmazenamento,
} from '@/lib/offline/books';
import { useOffline } from '@/components/offline-provider';

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dataCurta(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR');
}

export default function BaixadosPage() {
  const { atualizar: atualizarOffline } = useOffline();
  const [livros, setLivros] = useState<OfflineBook[] | null>(null);
  const [uso, setUso] = useState<UsoArmazenamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState<number | null>(null);

  async function carregar() {
    try {
      setLivros(await listarLivros());
      setUso(await usoArmazenamento());
    } catch {
      setErro('Não foi possível ler os livros baixados neste navegador.');
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function apagar(bookId: number) {
    setApagando(bookId);
    try {
      await removerLivro(bookId);
      await carregar();
      await atualizarOffline();
    } finally {
      setApagando(null);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Baixados</h1>
        <p className="text-sm text-muted-foreground">
          Livros salvos neste navegador para leitura sem internet.
          {uso && uso.cota ? ` Uso: ${mb(uso.uso)} de ${mb(uso.cota)}.` : ''}
        </p>
      </div>

      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}

      {livros === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : livros.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-card p-8 text-center ring-1 ring-border">
          <HardDriveDownloadIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Nenhum livro baixado. Abra um livro e toque em “Baixar” no leitor.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {livros.map((l) => (
            <li
              key={l.bookId}
              className="flex items-center justify-between gap-3 rounded-xl bg-card p-3 ring-1 ring-border"
            >
              <div className="min-w-0">
                <Link
                  href={`/${l.bookId}/read`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {l.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {l.format.toUpperCase()} · {mb(l.size)} · baixado em {dataCurta(l.savedAt)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => void apagar(l.bookId)}
                disabled={apagando === l.bookId}
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
