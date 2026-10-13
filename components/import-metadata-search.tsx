'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { MetadataReview, type ReviewValues } from './metadata-review';
import type { AggregatedBook } from '@/lib/metadata/types';

export function ImportMetadataSearch({ current, disabled, onApply }: {
  current: ReviewValues; disabled: boolean; onApply: (book: AggregatedBook) => void;
}) {
  const [query, setQuery] = useState(current.isbn13 || `${current.title} ${current.authors[0] ?? ''}`.trim());
  const [busy, setBusy] = useState(false);
  const [books, setBooks] = useState<AggregatedBook[] | null>(null);
  const [review, setReview] = useState<AggregatedBook | null>(null);
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function search() {
    if (!query.trim()) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(''); setBooks(null); setReview(null);
    try {
      const response = await fetch(`/api/books/metadata?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Não foi possível buscar agora.');
      setBooks(data.resultados ?? []);
      if (data.falhas?.length) setMessage('Algumas fontes não responderam. Confira os resultados disponíveis.');
      else if (!data.resultados?.length) setMessage('Nenhum resultado. Você pode continuar com os dados do arquivo.');
    } catch (e) {
      if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : 'Não foi possível buscar agora.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <details className="space-y-3 rounded-lg border p-4">
    <summary className="cursor-pointer font-medium">Completar dados com fontes externas</summary>
    <p className="text-sm text-muted-foreground">A busca envia o título, autor ou ISBN informado às fontes. Você revisa os valores antes de aplicá-los.</p>
    <Label htmlFor="import-search">Título, autor ou ISBN</Label>
    <div className="flex gap-2"><Input id="import-search" value={query} maxLength={300} disabled={disabled || busy}
      onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} />
      <Button type="button" variant="outline" disabled={disabled || busy || !query.trim()} onClick={() => void search()}>{busy ? 'Buscando…' : 'Buscar'}</Button></div>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {books && !review && <ul className="space-y-2">{books.map((book, index) => <li key={index} className="rounded border p-3">
      <p className="font-medium">{book.title}</p><p className="text-sm text-muted-foreground">{[book.authors.join(', '), book.language, book.publicationYear, book.isbn13].filter(Boolean).join(' · ')}</p>
      <Button type="button" variant="outline" size="sm" disabled={disabled} className="mt-2" onClick={() => setReview(book)}>Revisar dados</Button>
    </li>)}</ul>}
    {review && <MetadataReview key={books?.indexOf(review)} candidate={review} current={current} busy={disabled} allowCover={false}
      onConfirm={(book) => { onApply(book); setReview(null); setBooks(null); setMessage('Dados aplicados ao formulário. Confira antes de importar.'); }} onCancel={() => setReview(null)} />}
  </details>;
}
