'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpenIcon, CloudUploadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRefreshAgendado } from '@/lib/use-refresh-agendado';

interface ReadingActionInitial {
  readyToRead: boolean;
  hasFile: boolean;
  canPrepare: boolean;
}

export function ReadingAction({
  bookId,
  initial,
}: {
  bookId: number;
  initial: ReadingActionInitial;
}) {
  const agendarRefresh = useRefreshAgendado();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function marcar(readyToRead: boolean) {
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readyToRead }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível salvar.');
        return;
      }
      agendarRefresh();
    } catch {
      setErro('Falha de rede ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  if (initial.hasFile) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" asChild>
          <Link href={`/${bookId}/read`}>
            <BookOpenIcon className="mr-2 h-4 w-4" aria-hidden /> Ler
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">Arquivo pronto para leitura</span>
      </div>
    );
  }

  if (!initial.canPrepare) return null;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={initial.readyToRead ? 'outline' : 'default'}
        size="sm"
        disabled={salvando}
        onClick={() => void marcar(!initial.readyToRead)}
      >
        <CloudUploadIcon className="mr-2 h-4 w-4" aria-hidden />
        {initial.readyToRead ? 'Remover da preparação' : 'Preparar para leitura'}
      </Button>
      {initial.readyToRead && (
        <p className="text-sm text-muted-foreground">
          Marquei como pronto. Rode <code className="rounded bg-muted px-1">pnpm db:sync-files</code> no
          computador para subir o arquivo do Calibre.
        </p>
      )}
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
