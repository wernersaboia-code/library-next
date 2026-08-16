'use client';

import { useState } from 'react';
import { PencilIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRefreshAgendado } from '@/lib/use-refresh-agendado';

/**
 * Título em língua original, editável em qualquer livro — inclusive os
 * importados do Calibre: a coluna fica fora de CatalogMetadata, então o
 * sync nunca a sobrescreve (ver lib/db/calibre-sync.ts).
 */
export function OriginalTitleEditor({
  bookId,
  inicial,
}: {
  bookId: number;
  inicial: string | null;
}) {
  const agendarRefresh = useRefreshAgendado();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(inicial ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalTitle: valor }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível salvar.');
        return;
      }
      setEditando(false);
      agendarRefresh();
    } catch {
      setErro('Falha de rede. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  function cancelar() {
    setValor(inicial ?? '');
    setErro(null);
    setEditando(false);
  }

  if (editando) {
    return (
      <div className="mb-1">
        <div className="flex items-center gap-2">
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Título em língua original"
            className="h-8 w-64 text-sm"
            aria-label="Título original"
          />
          <Button type="button" size="sm" onClick={() => void salvar()} disabled={salvando}>
            Salvar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={cancelar}>
            Cancelar
          </Button>
        </div>
        {erro && <p className="mt-1 text-sm text-red-600">{erro}</p>}
      </div>
    );
  }

  return (
    <div className="mb-1 flex items-center gap-2">
      {valor ? (
        <p className="text-sm text-muted-foreground">
          Título original: {valor}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Adicionar título original
        </button>
      )}
      {valor && (
        <button
          type="button"
          onClick={() => setEditando(true)}
          aria-label="Editar título original"
          className="text-muted-foreground hover:text-foreground"
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
