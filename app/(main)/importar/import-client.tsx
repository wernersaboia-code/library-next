'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validarArquivo, limiteEmMegabytes } from '@/lib/arquivo-do-livro';
import { extractBookMetadata } from '@/lib/import-book';
import { enviarArquivoDoLivro, hashDoArquivo } from '@/lib/book-upload';
import type { DuplicateBook } from '@/lib/book-duplicates';
import { ImportMetadataSearch } from '@/components/import-metadata-search';

const EMPTY = { title: '', authors: '', isbn13: '', language: '', publisher: '', publicationYear: '', numPages: '', description: '' };
type Draft = typeof EMPTY;
const REASONS = { arquivo: 'Este arquivo já está no acervo', isbn: 'Mesmo ISBN', 'titulo-autor': 'Mesmo título e autor; pode ser outra edição', titulo: 'Título igual; confira o autor' };

export function ImportClient({ maxBytes }: { maxBytes: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [cover, setCover] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sha256, setSha256] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateBook[] | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [doneId, setDoneId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const attempt = useRef(0);
  const targetRef = useRef<number | null>(null);
  const createdRef = useRef(false);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!cover) { setPreview(null); return; }
    const url = URL.createObjectURL(cover);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);
  useEffect(() => () => { attempt.current += 1; }, []);

  async function choose(arquivo: File) {
    const version = ++attempt.current;
    setError(null); setWarning(null); setDuplicates(null); setDoneId(null);
    setFile(null); setCover(null); setDraft(EMPTY); setSha256(null);
    targetRef.current = null; createdRef.current = false; setTargetId(null);
    const validation = validarArquivo(arquivo.name, arquivo.size, maxBytes);
    if (!validation.ok) { setError(validation.erro); return; }
    setBusy(true); setStatus('Lendo os dados do arquivo…');
    try {
      const [data, hash] = await Promise.all([extractBookMetadata(arquivo), hashDoArquivo(arquivo)]);
      if (version !== attempt.current) return;
      setFile(arquivo); setSha256(hash); setCover(data.cover);
      setDraft({ title: data.title, authors: data.authors.join('\n'), isbn13: data.isbn13 ?? '',
        language: data.language ?? '', publisher: data.publisher ?? '',
        publicationYear: data.publicationYear?.toString() ?? '', numPages: data.numPages?.toString() ?? '',
        description: data.description ?? '' });
      setStatus('Confira os dados antes de importar.');
    } catch {
      if (version === attempt.current) setError('Não foi possível ler este arquivo. Confira se é um EPUB ou PDF válido e sem senha.');
    } finally {
      if (version === attempt.current) setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function change(key: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDuplicates(null);
  }

  async function save(allowDuplicate = false, existingId?: number) {
    if (!file || sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true); setError(null); setWarning(null);
    try {
      let bookId = targetRef.current ?? existingId;
      if (!bookId) {
        setStatus('Verificando se o livro já está no acervo…');
        const response = await fetch('/api/books', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...draft, authors: draft.authors.split('\n').map((s) => s.trim()).filter(Boolean),
            owned: true, sha256, checkDuplicates: true, allowDuplicate }),
        });
        const data = await response.json().catch(() => null);
        if (response.status === 409 && Array.isArray(data?.duplicates)) {
          setDuplicates(data.duplicates); setStatus('Encontramos cadastros parecidos. Confira antes de continuar.'); return;
        }
        if (!response.ok || !Number.isInteger(data?.bookId) || data.bookId <= 0) throw new Error(data?.error ?? 'Não foi possível cadastrar.');
        bookId = data.bookId as number;
        createdRef.current = true;
      }
      targetRef.current = bookId; setTargetId(bookId); setDuplicates(null);
      setStatus('Enviando arquivo… 0%');
      await enviarArquivoDoLivro(bookId, file, maxBytes, (p) => setStatus(`Enviando arquivo… ${p}%`), sha256);
      // Capas de um cadastro existente (especialmente do Calibre) são preservadas.
      if (cover && createdRef.current) {
        try {
          const form = new FormData(); form.set('file', cover, 'cover.jpg');
          const response = await fetch(`/api/books/${bookId}/cover`, { method: 'POST', body: form });
          if (!response.ok) setWarning('O livro foi importado, mas a capa não pôde ser salva.');
        } catch { setWarning('O livro foi importado, mas a capa não pôde ser salva.'); }
      }
      setDoneId(bookId); setStatus('Livro importado. Já está pronto para leitura.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao importar o livro.');
      if (targetRef.current) setStatus('O cadastro está salvo. Tente enviar novamente para concluir neste mesmo livro.');
    } finally { sendingRef.current = false; setBusy(false); }
  }

  return <div className="max-w-3xl space-y-5">
    <div className="rounded-lg border p-4">
      <Label htmlFor="import-file">Arquivo do livro</Label>
      <Input ref={inputRef} id="import-file" className="mt-2 h-auto py-2" type="file"
        accept=".epub,.pdf,application/epub+zip,application/pdf" disabled={busy || targetId !== null}
        onChange={(e) => { const arquivo = e.target.files?.[0]; if (arquivo) void choose(arquivo); }} />
      <p className="mt-2 text-sm text-muted-foreground">Até {limiteEmMegabytes(maxBytes)} MB. No celular, o seletor também pode acessar o Google Drive pelo app do Drive.</p>
      {file && <p className="mt-2 break-all text-sm">{file.name}</p>}
    </div>
    {status && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {warning && <p role="status" className="text-sm text-muted-foreground">{warning}</p>}
    {doneId ? <div className="flex flex-wrap gap-2">
      <Button asChild><Link href={`/${doneId}/read`}>Ler agora</Link></Button>
      <Button asChild variant="outline"><Link href={`/${doneId}`}>Ver livro</Link></Button>
      <Button variant="ghost" onClick={() => {
        targetRef.current = null; createdRef.current = false; setTargetId(null); setDoneId(null); setFile(null);
        setDraft(EMPTY); setCover(null); setStatus(''); setWarning(null);
      }}>Importar outro</Button>
    </div> : file && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <ImportMetadataSearch key={file.name + file.size + file.lastModified} disabled={busy || targetId !== null}
        current={{ ...draft, authors: draft.authors.split('\n').filter(Boolean), publicationYear: Number(draft.publicationYear) || null, numPages: Number(draft.numPages) || null }}
        onApply={(book) => {
          setDraft({ title: book.title, authors: book.authors.join('\n'), isbn13: book.isbn13 ?? '', language: book.language ?? '',
            publisher: book.publisher ?? '', publicationYear: book.publicationYear?.toString() ?? '', numPages: book.numPages?.toString() ?? '', description: book.description ?? '' });
          setDuplicates(null);
        }} />
      <fieldset disabled={busy || targetId !== null} className="space-y-4">
        {preview && <div className="flex items-start gap-4">
          {/* URL local, temporária, da capa extraída do arquivo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={`Capa de ${draft.title}`} className="h-36 w-24 rounded object-contain" />
          <Button type="button" variant="ghost" onClick={() => setCover(null)}>Usar capa gerada</Button>
        </div>}
        <div><Label htmlFor="import-title">Título</Label><Input id="import-title" required value={draft.title} onChange={(e) => change('title', e.target.value)} /></div>
        <div><Label htmlFor="import-authors">Autores (um por linha)</Label>
          <textarea id="import-authors" rows={2} className="w-full rounded-md border bg-background p-2 text-sm" value={draft.authors} onChange={(e) => change('authors', e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {([
            ['isbn13', 'ISBN', 'text'], ['language', 'Idioma (pt, en, por…)', 'text'],
            ['publisher', 'Editora', 'text'], ['publicationYear', 'Ano de publicação', 'number'], ['numPages', 'Páginas', 'number'],
          ] as const).map(([key, label, type]) => <div key={key}>
            <Label htmlFor={`import-${key}`}>{label}</Label>
            <Input id={`import-${key}`} type={type} min={type === 'number' ? 1 : undefined} step={type === 'number' ? 1 : undefined}
              value={draft[key]} onChange={(e) => change(key, e.target.value)} />
          </div>)}
        </div>
        <div><Label htmlFor="import-description">Sinopse</Label>
          <textarea id="import-description" rows={5} className="w-full rounded-md border bg-background p-2 text-sm" value={draft.description} onChange={(e) => change('description', e.target.value)} />
        </div>
      </fieldset>
      {duplicates && <section className="space-y-3 rounded-lg border p-4" aria-label="Possíveis duplicados">
        <h2 className="font-semibold">Este livro pode já estar cadastrado</h2>
        {duplicates.map((book) => <div key={book.id} className="space-y-1 border-b pb-3 last:border-0">
          <Link href={`/${book.id}`} className="font-medium underline">{book.title}</Link>
          <p className="text-sm text-muted-foreground">{book.authors.join(', ') || 'Autor não informado'} · {REASONS[book.reason]}</p>
          {book.hasFile ? <Button asChild variant="outline" size="sm"><Link href={`/${book.id}/read`}>Abrir livro existente</Link></Button>
            : book.owned && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void save(false, book.id)}>Enviar arquivo para este cadastro</Button>}
        </div>)}
        <Button type="button" variant="outline" disabled={busy} onClick={() => void save(true)}>É outra edição: cadastrar mesmo assim</Button>
      </section>}
      <Button type="submit" disabled={busy || duplicates !== null}>
        {busy ? 'Importando…' : targetId ? 'Tentar envio novamente' : 'Importar para o acervo'}
      </Button>
    </form>}
  </div>;
}
