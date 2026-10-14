import { describe, expect, it } from 'vitest';
import { readingCsv, readingMarkdown, type ReadingExport } from '@/lib/reading-export';

const data: ReadingExport = {
  books: [{ id: 1, title: 'Um "livro", especial', authors: ['Autora'], read_status: 'lendo', my_rating: 4.5, progress_percent: 42,
    date_started: '2026-10-01', date_finished: null, dnf_reason: null, last_locator: { format: 'pdf', page: 21 } }],
  notes: [{ bookId: 1, kind: 'quote', textContent: 'Linha 1\nLinha 2', note: 'Meu comentário', createdAt: '2026-10-02T00:00:00Z', locator: { page: 2 } }],
};

describe('exportação de leitura', () => {
  it('preserva acentos, aspas, quebras, zero e notas em CSV', () => {
    const csv = readingCsv(data);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Um ""livro"", especial"');
    expect(csv).toContain('Linha 1\nLinha 2\nMeu comentário');
    expect(readingCsv({ ...data, books: [{ ...data.books[0], progress_percent: 0 }] })).toContain('"0"');
  });
  it('impede que texto exportado vire fórmula de planilha', () => {
    for (const title of ['=HYPERLINK("x")', '+cmd', '-cmd', '@SUM(1)', '\t=cmd', '  =cmd']) {
      expect(readingCsv({ books: [{ ...data.books[0], title }], notes: [] })).toContain(`"'${title.replaceAll('"', '""')}"`);
    }
  });
  it('exporta histórico, notas e posição em Markdown sem HTML ativo', () => {
    const markdown = readingMarkdown(data);
    expect(markdown).toContain('Progresso: 42%');
    expect(markdown).toContain('> Linha 1\n> Linha 2');
    expect(markdown).toContain('Meu comentário');
    expect(markdown).toContain('"page":21');
    expect(readingMarkdown({ books: [{ ...data.books[0], title: '<script>x</script>' }], notes: [] })).not.toContain('<script>');
  });
  it('funciona com um acervo vazio', () => {
    expect(readingCsv({ books: [], notes: [] })).toContain('Título');
    expect(readingMarkdown({ books: [], notes: [] })).toContain('Nenhum livro');
  });
});
