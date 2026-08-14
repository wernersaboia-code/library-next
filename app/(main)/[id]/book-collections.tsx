'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

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
  const router = useRouter();
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
      router.refresh();
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
          <span className="text-sm text-gray-500">Nenhuma biblioteca</span>
        ) : (
          atuais.map((b) => (
            <Link
              key={b.id}
              href={`/bibliotecas/${b.id}`}
              className="rounded-full bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
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
        <div className="flex flex-wrap gap-2 rounded-md border p-3">
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
