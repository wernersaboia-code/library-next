'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from './ui/button';
import { savedSearchQuery, type SavedSearch } from '@/lib/saved-searches';

export function SavedSearches({ initial, query }: { initial: SavedSearch[]; query: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterQuery = savedSearchQuery(query);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/saved-searches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, query: filterQuery }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Não foi possível salvar.');
      setItems((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setName(''); setEditing(false);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha de rede.'); }
    finally { setBusy(false); }
  }

  async function remove(item: SavedSearch) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/saved-searches?id=${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Não foi possível remover.');
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha de rede.'); }
    finally { setBusy(false); }
  }

  return <section aria-label="Estantes dinâmicas" className="mb-5 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-2 text-sm font-semibold">Estantes dinâmicas</h2>
      {items.map((item) => <div key={item.id} className="flex items-center rounded-md border text-sm">
        <Link prefetch={false} href={`/?${item.query}`} aria-current={item.query === filterQuery ? 'page' : undefined} className="rounded-l-md px-3 py-2 hover:bg-accent aria-[current=page]:bg-accent">{item.name}</Link>
        <button type="button" disabled={busy} onClick={() => void remove(item)} aria-label={`Remover estante ${item.name}`} className="rounded-r-md px-2 py-2 text-muted-foreground hover:bg-accent disabled:opacity-50">×</button>
      </div>)}
      {filterQuery && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Salvar busca como estante</Button>}
    </div>
    {items.length === 0 && !filterQuery && <p className="text-sm text-muted-foreground">Aplique filtros ao acervo para salvar uma estante que se atualiza com seus livros.</p>}
    {editing && <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <label htmlFor="saved-search-name" className="sr-only">Nome da estante</label>
      <input id="saved-search-name" required maxLength={80} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Não lidos em português" className="h-9 rounded-md border bg-background px-3 text-sm" />
      <Button size="sm" disabled={busy || !filterQuery || !name.trim()}>Salvar</Button>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>Cancelar</Button>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
