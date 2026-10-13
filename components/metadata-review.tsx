'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { normalizeLanguage } from '@/lib/languages';
import { toIsbn13 } from '@/lib/metadata/util';
import type { AggregatedBook } from '@/lib/metadata/types';

export type ReviewValues = Pick<AggregatedBook, 'title' | 'authors' | 'isbn13' | 'language' | 'publisher' | 'publicationYear' | 'numPages' | 'description'>;
const FIELDS = [
  ['title', 'Título'], ['authors', 'Autores (um por linha)'], ['isbn13', 'ISBN'],
  ['language', 'Idioma'], ['publisher', 'Editora'], ['publicationYear', 'Ano de publicação'],
  ['numPages', 'Páginas'], ['description', 'Sinopse'],
] as const;
const SOURCE = { openlibrary: 'Open Library', googlebooks: 'Google Books', wikidata: 'Wikidata' };
const display = (value: string | number | string[] | null | undefined) => Array.isArray(value) ? value.join('\n') : value?.toString() ?? '';

/** Revisão ocorre antes de gravar. Dados atuais preenchidos são preservados inicialmente. */
export function MetadataReview({ candidate, current, onConfirm, onCancel, busy = false, confirmLabel = 'Usar estes dados', allowCover = true }: {
  candidate: AggregatedBook; current?: ReviewValues;
  onConfirm: (book: AggregatedBook) => void; onCancel: () => void; busy?: boolean; confirmLabel?: string; allowCover?: boolean;
}) {
  const [values, setValues] = useState(() => Object.fromEntries(FIELDS.map(([key]) =>
    [key, display(current && display(current[key]) ? current[key] : candidate[key])])) as Record<keyof ReviewValues, string>);
  const [useCover, setUseCover] = useState(true);
  const [error, setError] = useState('');

  function confirm() {
    const title = values.title.trim();
    const isbn13 = toIsbn13(values.isbn13);
    const language = normalizeLanguage(values.language);
    const year = values.publicationYear ? Number(values.publicationYear) : null;
    const pages = values.numPages ? Number(values.numPages) : null;
    if (!title || (values.isbn13.trim() && !isbn13) || (values.language.trim() && !language) ||
      [year, pages].some((v) => v !== null && (!Number.isInteger(v) || v <= 0))) {
      setError('Confira o título, o ISBN, o idioma e os números informados.'); return;
    }
    setError('');
    onConfirm({ ...candidate, title, isbn13, language, publicationYear: year, numPages: pages,
      authors: values.authors.split('\n').map((name) => name.trim()).filter(Boolean),
      publisher: values.publisher.trim() || null, description: values.description.trim() || null,
      cover: useCover ? candidate.cover : null });
  }

  return <section aria-label="Revisar metadados encontrados" className="space-y-4 rounded-lg border p-4"
    onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault(); }}>
    <div><h2 className="font-semibold">Revisar dados encontrados</h2>
      <p className="text-sm text-muted-foreground">Confira a edição e escolha os valores. Você também pode editar os campos.</p></div>
    <fieldset disabled={busy} className="space-y-4">
      {FIELDS.map(([key, label]) => {
        const suggested = candidate[key];
        const options = candidate.conflicts?.[key] ?? (suggested !== null && display(suggested) ? [{ value: suggested, sources: candidate.fieldSources?.[key] ?? [] }] : []);
        return <div key={key} className="space-y-1">
          <Label htmlFor={`review-${key}`}>{label}</Label>
          {current && <p className="whitespace-pre-line text-xs text-muted-foreground">Atual: {display(current[key]) || 'Não informado'}</p>}
          {key === 'description' || key === 'authors'
            ? <textarea id={`review-${key}`} rows={key === 'description' ? 4 : 2} className="w-full rounded-md border bg-background p-2 text-sm"
              value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
            : <Input id={`review-${key}`} value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />}
          {options.length > 1 && <p className="text-xs text-muted-foreground">As fontes divergem neste campo.</p>}
          {options.map((option, index) => <button type="button" key={index}
            className="block max-w-full rounded border px-2 py-1 text-left text-xs hover:bg-accent disabled:opacity-50"
            onClick={() => setValues({ ...values, [key]: display(option.value) })}>
            <span className="line-clamp-3 whitespace-pre-line">Usar: {display(option.value)}</span>
            <span className="text-muted-foreground">{option.sources.map((source) => SOURCE[source]).join(', ')}</span>
          </button>)}
        </div>;
      })}
      {allowCover && candidate.cover && <Label className="flex items-center gap-2">
        <input type="checkbox" checked={useCover} onChange={(e) => setUseCover(e.target.checked)} />
        Usar capa da {SOURCE[candidate.cover.provider]}
      </Label>}
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={busy} onClick={confirm}>{busy ? 'Salvando…' : confirmLabel}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancelar revisão</Button>
    </div>
  </section>;
}
