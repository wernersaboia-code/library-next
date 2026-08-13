'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface Note {
  id: string;
  kind: string;
  textContent: string | null;
  note: string | null;
  createdAt: string;
}

interface NotesSectionProps {
  bookId: number;
}

export function NotesSection({ bookId }: NotesSectionProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quote, setQuote] = useState('');
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuote, setEditQuote] = useState('');
  const [editComment, setEditComment] = useState('');

  async function loadNotes() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/notes`);
      if (!res.ok) {
        setError('Não foi possível carregar as notas.');
        return;
      }
      const data = (await res.json()) as Note[];
      setNotes(data);
    } catch {
      setError('Falha de rede ao carregar as notas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  async function addNote() {
    const trimmedQuote = quote.trim();
    const trimmedComment = comment.trim();
    if (!trimmedQuote && !trimmedComment) {
      setError('Informe ao menos a citação ou o comentário.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: trimmedQuote ? 'quote' : 'note',
          textContent: trimmedQuote || undefined,
          note: trimmedComment || undefined,
        }),
      });
      if (!res.ok) {
        setError('Não foi possível salvar a nota.');
        return;
      }
      setQuote('');
      setComment('');
      await loadNotes();
    } catch {
      setError('Falha de rede ao salvar a nota.');
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(n: Note) {
    setEditingId(n.id);
    setEditQuote(n.textContent ?? '');
    setEditComment(n.note ?? '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditQuote('');
    setEditComment('');
  }

  async function saveEdit(noteId: string) {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId,
          textContent: editQuote.trim() || null,
          note: editComment.trim() || null,
        }),
      });
      if (!res.ok) {
        setError('Não foi possível atualizar a nota.');
        return;
      }
      cancelEdit();
      await loadNotes();
    } catch {
      setError('Falha de rede ao atualizar a nota.');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteNote(noteId: string) {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}/notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      });
      if (!res.ok) {
        setError('Não foi possível apagar a nota.');
        return;
      }
      await loadNotes();
    } catch {
      setError('Falha de rede ao apagar a nota.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="border rounded-md p-4 mb-6 space-y-4">
      <h2 className="text-lg font-semibold">Notas e citações</h2>

      <div className="space-y-2">
        <div>
          <Label className="block mb-1" htmlFor="note-quote">
            Citação (opcional)
          </Label>
          <textarea
            id="note-quote"
            className="flex w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="Trecho do livro..."
          />
        </div>
        <div>
          <Label className="block mb-1" htmlFor="note-comment">
            Comentário
          </Label>
          <textarea
            id="note-comment"
            className="flex w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="O que você achou desse trecho?"
          />
        </div>
        <Button type="button" onClick={() => void addNote()} disabled={isSaving}>
          Adicionar nota
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando notas...</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma nota ainda.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="border rounded-md p-3">
              {editingId === n.id ? (
                <div className="space-y-2">
                  <textarea
                    className="flex w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editQuote}
                    onChange={(e) => setEditQuote(e.target.value)}
                    placeholder="Trecho do livro..."
                  />
                  <textarea
                    className="flex w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value)}
                    placeholder="Comentário..."
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void saveEdit(n.id)}
                      disabled={isSaving}
                    >
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={cancelEdit}
                      disabled={isSaving}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {n.textContent && (
                    <p className="italic text-gray-700">&ldquo;{n.textContent}&rdquo;</p>
                  )}
                  {n.note && <p className="text-sm">{n.note}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(n)}
                      disabled={isSaving}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => void deleteNote(n.id)}
                      disabled={isSaving}
                    >
                      Apagar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
