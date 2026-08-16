'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useRefreshAgendado } from '@/lib/use-refresh-agendado';

interface Biblioteca {
  id: number;
  name: string;
}

export function BookCollections({
  bookId,
  atuais,
  todas,
}: {
  bookId: number;
  atuais: Biblioteca[];
  todas: Biblioteca[];
}) {
  const agendarRefresh = useRefreshAgendado();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pertence = new Set(atuais.map((b) => b.id));

  async function alternar(bibliotecaId: number, jaPertence: boolean) {
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/collections/${bibliotecaId}/books`, {
        method: jaPertence ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookIds: [bookId] }),
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

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {atuais.length === 0 ? (
          <span className="text-sm text-muted-foreground">Nenhuma biblioteca</span>
        ) : (
          atuais.map((b) => (
            <Link
              key={b.id}
              href={`/bibliotecas/${b.id}`}
              className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground transition-colors hover:bg-accent"
            >
              {b.name}
            </Link>
          ))
        )}
        {todas.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditando((v) => !v)}
          >
            {editando ? 'Fechar' : 'Editar'}
          </Button>
        )}
      </div>

      {editando && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-border p-3">
          {todas.map((b) => {
            const dentro = pertence.has(b.id);
            return (
              <Button
                key={b.id}
                type="button"
                size="sm"
                variant={dentro ? 'default' : 'outline'}
                disabled={salvando}
                onClick={() => void alternar(b.id, dentro)}
              >
                {dentro ? `✓ ${b.name}` : b.name}
              </Button>
            );
          })}
        </div>
      )}

      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
