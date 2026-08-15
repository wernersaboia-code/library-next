'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookmarkIcon, HeartIcon } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Estrelas } from '@/components/estrelas';

const READ_STATUS_OPTIONS = [
  { value: 'lido', label: '✅ Lido' },
  { value: 'lendo', label: '📖 Lendo' },
  { value: 'não lido', label: '🕐 Não lido' },
  { value: 'abandonado', label: '🚫 Abandonado' },
];

interface TrackingInitial {
  readStatus: string;
  dateStarted: string | null;
  dateFinished: string | null;
  myRating: number | null;
  dnfReason: string | null;
  nextUp: boolean;
  favorite: boolean;
  owned: boolean;
}

interface TrackingControlsProps {
  bookId: number;
  initial: TrackingInitial;
}

export function TrackingControls({ bookId, initial }: TrackingControlsProps) {
  const router = useRouter();
  const [readStatus, setReadStatus] = useState(initial.readStatus);
  const [dateStarted, setDateStarted] = useState(initial.dateStarted ?? '');
  const [dateFinished, setDateFinished] = useState(initial.dateFinished ?? '');
  const [myRating, setMyRating] = useState(initial.myRating);
  const [motivo, setMotivo] = useState(initial.dnfReason ?? '');
  const [nextUp, setNextUp] = useState(initial.nextUp);
  const [favorite, setFavorite] = useState(initial.favorite);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function update(body: Record<string, unknown>): Promise<boolean> {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Não foi possível salvar. Tente novamente.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('Falha de rede. Tente novamente.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function alternarProximo() {
    const alvo = !nextUp;
    setNextUp(alvo);
    // Reverter no erro: sem isso o botão fica mentindo sobre o que o banco
    // tem — e o dono só descobre na página da fila.
    if (!(await update({ nextUp: alvo }))) setNextUp(!alvo);
  }

  async function alternarFavorito() {
    const alvo = !favorite;
    setFavorite(alvo);
    if (!(await update({ favorite: alvo }))) setFavorite(!alvo);
  }

  return (
    <div className="border rounded-md p-4 mb-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label className="block mb-1">Status de leitura</Label>
          <Select
            value={readStatus}
            onValueChange={(value) => {
              setReadStatus(value);
              // Abandonar não some com a marca de favorito nem com o
              // progresso — só o status muda. Ver AD-3 e AD-7.
              void update({ readStatus: value });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {READ_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="block mb-1" htmlFor="date-started">
            Data de início
          </Label>
          <input
            id="date-started"
            type="date"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={dateStarted}
            onChange={(e) => {
              const value = e.target.value;
              setDateStarted(value);
              void update({ dateStarted: value || null });
            }}
          />
        </div>

        <div>
          <Label className="block mb-1" htmlFor="date-finished">
            Data de término
          </Label>
          <input
            id="date-finished"
            type="date"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={dateFinished}
            onChange={(e) => {
              const value = e.target.value;
              setDateFinished(value);
              void update({ dateFinished: value || null });
            }}
          />
        </div>
      </div>

      {/* O motivo nasce aqui, colado no seletor que o provocou (AD-4).
          Antes ele ficava no bloco de Progresso, longe o bastante para o
          dono não ver que tinha aparecido. */}
      {readStatus === 'abandonado' && (
        <div>
          <Label className="block mb-1" htmlFor="motivo-abandono">
            Por que abandonou?
          </Label>
          <textarea
            id="motivo-abandono"
            autoFocus
            className="flex w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Pode ser o motivo para voltar a ele um dia..."
          />
          <Button
            type="button"
            size="sm"
            className="mt-2"
            onClick={() => void update({ dnfReason: motivo })}
            disabled={isSaving}
          >
            Salvar motivo
          </Button>
        </div>
      )}

      <div>
        <Label className="block mb-1">Minha avaliação</Label>
        <Estrelas
          nota={myRating}
          onEscolher={(nota) => {
            setMyRating(nota);
            void update({ myRating: nota });
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {/* A fila é do que se tem: livro de "Quero ter" não entra (AD-6). */}
        {initial.owned && (
          <Button
            type="button"
            variant={nextUp ? 'default' : 'outline'}
            size="sm"
            onClick={() => void alternarProximo()}
            disabled={isSaving}
          >
            <BookmarkIcon className={`mr-2 h-4 w-4 ${nextUp ? 'fill-current' : ''}`} />
            {nextUp ? 'Na fila para ler' : 'Ler em seguida'}
          </Button>
        )}

        {/* Favorito é julgamento sobre livro lido (AD-7). */}
        {readStatus === 'lido' && (
          <Button
            type="button"
            variant={favorite ? 'default' : 'outline'}
            size="sm"
            onClick={() => void alternarFavorito()}
            disabled={isSaving}
          >
            <HeartIcon className={`mr-2 h-4 w-4 ${favorite ? 'fill-current' : ''}`} />
            {favorite ? 'Favorito' : 'Marcar como favorito'}
          </Button>
        )}
      </div>

      {isSaving && <p className="text-sm text-gray-500">Salvando...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
