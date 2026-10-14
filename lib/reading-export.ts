export interface ExportBook {
  id: number;
  title: string;
  authors: string[];
  read_status: string;
  my_rating: number | null;
  progress_percent: number | null;
  date_started: string | null;
  date_finished: string | null;
  dnf_reason: string | null;
  last_locator: unknown;
}

export interface ExportNote {
  bookId: number;
  kind: string;
  textContent: string | null;
  note: string | null;
  createdAt: Date | string;
  locator: unknown;
}

export interface ReadingExport { books: ExportBook[]; notes: ExportNote[] }

/** Aspas RFC 4180 e neutralização de fórmulas em planilhas. */
function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Planilhas podem ignorar controles antes de um sinal de fórmula.
  // eslint-disable-next-line no-control-regex
  if (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function readingCsv(data: ReadingExport): string {
  const notesByBook = new Map<number, string[]>();
  for (const note of data.notes) {
    const entries = notesByBook.get(note.bookId) ?? [];
    entries.push([note.textContent, note.note].filter(Boolean).join('\n'));
    notesByBook.set(note.bookId, entries);
  }
  const rows: unknown[][] = [['ID', 'Título', 'Autores', 'Status', 'Avaliação', 'Progresso (%)', 'Início', 'Conclusão', 'Motivo de abandono', 'Notas e citações']];
  for (const book of data.books) rows.push([
    book.id, book.title, book.authors.join('; '), book.read_status, book.my_rating,
    book.progress_percent, book.date_started, book.date_finished, book.dnf_reason,
    notesByBook.get(book.id)?.join('\n\n') ?? '',
  ]);
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const md = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&');

export function readingMarkdown(data: ReadingExport): string {
  const notesByBook = new Map<number, ExportNote[]>();
  for (const note of data.notes) {
    const entries = notesByBook.get(note.bookId) ?? [];
    entries.push(note); notesByBook.set(note.bookId, entries);
  }
  const lines = ['# Meus dados de leitura', ''];
  if (data.books.length === 0) lines.push('Nenhum livro cadastrado.', '');
  for (const book of data.books) {
    lines.push(`## ${md(book.title.replace(/\r?\n/g, ' '))}`, '',
      `- ID: ${book.id}`, `- Autores: ${md(book.authors.join('; '))}`,
      `- Status: ${md(book.read_status)}`, `- Avaliação: ${book.my_rating ?? 'Sem avaliação'}`,
      `- Progresso: ${book.progress_percent == null ? 'Não informado' : `${book.progress_percent}%`}`,
      `- Início: ${book.date_started ?? 'Não informado'}`, `- Conclusão: ${book.date_finished ?? 'Não informada'}`, '');
    if (book.dnf_reason) lines.push(`Motivo de abandono: ${md(book.dnf_reason)}`, '');
    if (book.last_locator) lines.push('Posição de leitura:', '', `    ${JSON.stringify(book.last_locator)}`, '');
    for (const note of notesByBook.get(book.id) ?? []) {
      const label = note.kind === 'note' ? 'Nota' : note.kind === 'quote' ? 'Citação' : 'Destaque';
      lines.push(`### ${label} — ${new Date(note.createdAt).toISOString()}`, '');
      if (note.textContent) lines.push(...md(note.textContent).split(/\r?\n/).map((line) => `> ${line}`), '');
      if (note.note) lines.push(md(note.note), '');
      if (note.locator) lines.push('Localização:', '', `    ${JSON.stringify(note.locator)}`, '');
    }
  }
  return lines.join('\n');
}
