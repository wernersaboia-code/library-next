'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { authorHref, seriesHref } from '@/lib/catalog-browse';
import type { CatalogGroup } from '@/lib/db/catalog-browse';

function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'); }

export function CatalogGroupIndex({ groups, kind }: { groups: CatalogGroup[]; kind: 'authors' | 'series' }) {
  const [filter, setFilter] = useState('');
  const visible = groups.filter((group) => normalize(group.name).includes(normalize(filter.trim())));
  return <div className="space-y-4">
    <div className="max-w-md"><Label htmlFor="group-filter">{kind === 'authors' ? 'Procurar autor' : 'Procurar série'}</Label>
      <Input id="group-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Digite parte do nome" /></div>
    <p role="status" className="text-sm text-muted-foreground">{visible.length.toLocaleString('pt-BR')} de {groups.length.toLocaleString('pt-BR')} {kind === 'authors' ? 'autores' : 'séries'}</p>
    {visible.length ? <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((group) => <li key={group.id}><Link href={kind === 'authors' ? authorHref(group.id) : seriesHref(group.name)}
        className="flex h-full items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        <span className="min-w-0 break-words font-medium">{group.name}</span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{group.total} {group.total === 1 ? 'livro' : 'livros'}</span>
      </Link></li>)}
    </ul> : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      {groups.length ? 'Nenhum nome encontrado. Tente outro trecho.' : kind === 'authors' ? 'Os autores aparecem aqui quando seus livros são cadastrados.' : 'As séries aparecem aqui quando informadas no catálogo do Calibre.'}
    </p>}
  </div>;
}
