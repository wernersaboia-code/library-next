'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Biblioteca {
  id: number;
  name: string;
  total: number;
}

export function BibliotecasClient({ initial }: { initial: Biblioteca[] }) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');

  async function criar() {
    const limpo = nome.trim();
    if (!limpo) {
      setErro('Dê um nome à biblioteca.');
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: limpo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível criar a biblioteca.');
        return;
      }
      setNome('');
      router.refresh();
    } catch {
      setErro('Falha de rede ao criar a biblioteca.');
    } finally {
      setSalvando(false);
    }
  }

  async function renomear(id: number) {
    const limpo = nomeEditado.trim();
    if (!limpo) {
      setErro('Dê um nome à biblioteca.');
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: limpo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível renomear.');
        return;
      }
      setEditandoId(null);
      router.refresh();
    } catch {
      setErro('Falha de rede ao renomear.');
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(b: Biblioteca) {
    // Diz o tamanho do estrago antes de fazer: os livros ficam, os
    // vínculos não.
    const confirmado = confirm(
      b.total > 0
        ? `Apagar "${b.name}"? ${b.total} livro(s) sairão dela, mas continuam no acervo.`
        : `Apagar "${b.name}"?`
    );
    if (!confirmado) return;

    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/collections/${b.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível apagar.');
        return;
      }
      router.refresh();
    } catch {
      setErro('Falha de rede ao apagar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-md p-4 space-y-3">
        <Label className="block" htmlFor="nova-biblioteca">
          Nova biblioteca
        </Label>
        <div className="flex gap-2">
          <Input
            id="nova-biblioteca"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void criar();
              }
            }}
            placeholder="Ex.: Terror, Ler em 2027"
          />
          <Button type="button" onClick={() => void criar()} disabled={salvando}>
            Criar
          </Button>
        </div>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>

      {initial.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nenhuma biblioteca ainda. Crie a primeira acima.
        </p>
      ) : (
        <ul className="space-y-2">
          {initial.map((b) => (
            <li
              key={b.id}
              className="border rounded-md p-3 flex items-center justify-between gap-3"
            >
              {editandoId === b.id ? (
                <div className="flex flex-1 gap-2">
                  <Input
                    value={nomeEditado}
                    onChange={(e) => setNomeEditado(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void renomear(b.id)}
                    disabled={salvando}
                  >
                    Salvar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditandoId(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <>
                  <Link href={`/bibliotecas/${b.id}`} className="min-w-0 flex-1">
                    <span className="font-medium">{b.name}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      {b.total} {b.total === 1 ? 'livro' : 'livros'}
                    </span>
                  </Link>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditandoId(b.id);
                        setNomeEditado(b.name);
                      }}
                    >
                      Renomear
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void apagar(b)}
                      disabled={salvando}
                    >
                      Apagar
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
