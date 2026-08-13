'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StarIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const READ_STATUS_OPTIONS = [
  { value: 'lido', label: '✅ Lido' },
  { value: 'lendo', label: '📖 Lendo' },
  { value: 'não lido', label: '🕐 Não lido' },
];

interface TrackingInitial {
  readStatus: string;
  dateStarted: string | null;
  dateFinished: string | null;
  myRating: number | null;
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
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function update(body: Record<string, unknown>) {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError('Não foi possível salvar. Tente novamente.');
        return;
      }
      router.refresh();
    } catch {
      setError('Falha de rede. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
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

      <div>
        <Label className="block mb-1">Minha avaliação</Label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`Avaliar com ${star} estrela${star > 1 ? 's' : ''}`}
              onClick={() => {
                const nextRating = myRating === star ? null : star;
                setMyRating(nextRating);
                void update({ myRating: nextRating });
              }}
              className="p-0.5"
            >
              <StarIcon
                className={`w-6 h-6 ${
                  myRating !== null && star <= myRating
                    ? 'text-yellow-400 fill-current'
                    : 'text-gray-300'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {isSaving && (
        <p className="text-sm text-gray-500">Salvando...</p>
      )}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
