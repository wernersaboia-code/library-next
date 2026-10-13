import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { epubResourcePath, extractBookMetadata, metadataFromPdf } from '@/lib/import-book';

// Fixtures usam as mesmas dependências de ZIP/XML do epubjs instalado.
const localRequire = createRequire(import.meta.url);
const epubRequire = createRequire(localRequire.resolve('epubjs'));
const JSZip = epubRequire('jszip');
const { DOMParser } = epubRequire('@xmldom/xmldom');
const pdf = vi.hoisted(() => ({ getDocument: vi.fn(), destroy: vi.fn(), GlobalWorkerOptions: { workerSrc: '' } }));
vi.mock('react-pdf', () => ({ pdfjs: pdf }));

beforeEach(() => {
  vi.stubGlobal('window', { decodeURIComponent, URL });
  vi.stubGlobal('DOMParser', DOMParser);
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

async function epub(opf: string, containerPath = 'OPS/package.opf') {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${containerPath}"/></rootfiles></container>`);
  zip.file('OPS/package.opf', opf);
  zip.file('OPS/images/cover.png', new Uint8Array([137, 80, 78, 71]));
  return new File([await zip.generateAsync({ type: 'uint8array' })], 'Exemplo.epub', { type: 'application/epub+zip' });
}
const opf = `<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Livro &amp; Companhia</dc:title><dc:creator>Ana</dc:creator><dc:creator>João</dc:creator>
  <dc:identifier>urn:uuid:123</dc:identifier><dc:identifier>ISBN: 0-441-01359-7</dc:identifier>
  <dc:language>pt-BR</dc:language><dc:publisher>Editora</dc:publisher><dc:date>2020-05-03</dc:date>
  <dc:description>Sinopse do livro</dc:description></metadata>
  <manifest><item id="cover" properties="cover-image" href="images/cover.png" media-type="image/png"/></manifest></package>`;

describe('extração de EPUB/PDF', () => {
  it('lê um ZIP EPUB real, todos os autores, ISBN e capa relativa ao OPF', async () => {
    const result = await extractBookMetadata(await epub(opf));
    expect(result).toMatchObject({ title: 'Livro & Companhia', authors: ['Ana', 'João'], isbn13: '9780441013593',
      language: 'por', publisher: 'Editora', publicationYear: 2020, description: 'Sinopse do livro', numPages: null });
    expect(result.cover?.type).toBe('image/png');
    expect(result.cover?.size).toBe(4);
  });
  it('não consulta URLs externas para obter capa nem usa DOCTYPE', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await extractBookMetadata(await epub(opf.replace('images/cover.png', 'https://external.test/cover.png')));
    expect(result.cover).toBeNull(); expect(fetch).not.toHaveBeenCalled();
    await expect(extractBookMetadata(await epub('<!DOCTYPE package>' + opf))).rejects.toThrow();
    await expect(extractBookMetadata(await epub(opf, 'https://external.test/package.opf'))).rejects.toThrow();
    expect(epubResourcePath('../cover.png', '/OPS/package.opf')).toBe('/cover.png');
    expect(epubResourcePath('http://[invalid]', '/OPS/package.opf')).toBeNull();
  });
  it('recusa extensão disfarçada antes de abrir os parsers', async () => {
    await expect(extractBookMetadata(new File(['html'], 'x.pdf'))).rejects.toThrow();
    await expect(extractBookMetadata(new File(['html'], 'x.epub'))).rejects.toThrow();
    expect(pdf.getDocument).not.toHaveBeenCalled();
  });
  it('lê dados do PDF e libera o worker mesmo quando a extração falha', async () => {
    pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 9,
      getMetadata: async () => ({ info: { Title: 'PDF', Author: 'Autor', CreationDate: 'D:20261012', Subject: 'Sinopse' } }) }), destroy: pdf.destroy });
    const result = await extractBookMetadata(new File(['%PDF-fixture'], 'x.pdf'));
    expect(result).toMatchObject({ title: 'PDF', authors: ['Autor'], numPages: 9, publicationYear: null, description: 'Sinopse' });
    expect(pdf.getDocument).toHaveBeenCalledWith(expect.objectContaining({ isEvalSupported: false, data: expect.any(Uint8Array) }));
    expect(pdf.destroy).toHaveBeenCalledOnce();
    pdf.getDocument.mockReturnValue({ promise: Promise.reject(new Error('encrypted')), destroy: pdf.destroy });
    await expect(extractBookMetadata(new File(['%PDF-fixture'], 'x.pdf'))).rejects.toThrow('encrypted');
    expect(pdf.destroy).toHaveBeenCalledTimes(2);
  });
  it('usa nome do PDF quando faltam metadados e não confunde criação com publicação', () => {
    expect(metadataFromPdf({ Title: '', CreationDate: 'D:2020', ISBN: 'invalid' }, 2, 'Meu livro.pdf'))
      .toMatchObject({ title: 'Meu livro', numPages: 2, authors: [], publicationYear: null, isbn13: null });
  });
});
