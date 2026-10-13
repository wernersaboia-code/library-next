'use client';

import { formatoDoArquivo } from './arquivo-do-livro';
import { normalizeLanguage } from './languages';
import { toIsbn13, yearOf } from './metadata/util';

export interface ImportedMetadata {
  title: string;
  authors: string[];
  isbn13: string | null;
  language: string | null;
  publisher: string | null;
  publicationYear: number | null;
  numPages: number | null;
  description: string | null;
  cover: Blob | null;
}

function text(node: Element | null | undefined): string | null {
  return node?.textContent?.trim() || null;
}

export function metadataFromOpf(doc: Document, filename: string): ImportedMetadata {
  const dc = (name: string) => Array.from(doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', name));
  return {
    title: text(dc('title')[0]) ?? filename.replace(/\.epub$/i, ''),
    authors: [...new Set(dc('creator').map(text).filter((v): v is string => Boolean(v)))],
    isbn13: dc('identifier').map((el) => toIsbn13(text(el))).find(Boolean) ?? null,
    language: normalizeLanguage(text(dc('language')[0])),
    publisher: text(dc('publisher')[0]),
    publicationYear: yearOf(text(dc('date')[0])),
    description: text(dc('description')[0]), numPages: null, cover: null,
  };
}

/** Resolve somente arquivos do ZIP; referências externas não são consultadas. */
export function epubResourcePath(href: string, opfPath: string): string | null {
  try {
    const url = new URL(href, new URL(opfPath, 'https://epub.invalid/'));
    return url.origin === 'https://epub.invalid' ? url.pathname : null;
  } catch { return null; }
}

function parseXml(xml: string): Document {
  if (xml.length > 2 * 1024 * 1024 || /<!DOCTYPE/i.test(xml)) throw new Error('Metadados EPUB inválidos.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Metadados EPUB inválidos.');
  return doc;
}

async function fromEpub(file: File): Promise<ImportedMetadata> {
  const { default: ePub } = await import('epubjs');
  const book = ePub();
  try {
    // Os tipos do epubjs usam BinaryType (WebSocket) neste método por engano;
    // a implementação recebe ArrayBuffer. Só abrimos o ZIP, sem renderizar conteúdo.
    const openArchive = book.unarchive.bind(book) as unknown as (bytes: ArrayBuffer) => Promise<void>;
    await openArchive(await file.arrayBuffer());
    const container = parseXml(await book.archive.getText('/META-INF/container.xml'));
    const path = container.getElementsByTagNameNS('*', 'rootfile')[0]?.getAttribute('full-path');
    if (!path) throw new Error('O EPUB não informa onde estão os metadados.');
    const opfPath = epubResourcePath(path, '/');
    if (!opfPath) throw new Error('Caminho EPUB inválido.');
    const opf = parseXml(await book.archive.getText(opfPath));
    const result = metadataFromOpf(opf, file.name);
    const coverId = Array.from(opf.getElementsByTagNameNS('*', 'meta')).find((el) => el.getAttribute('name') === 'cover')?.getAttribute('content');
    const coverItem = Array.from(opf.getElementsByTagNameNS('*', 'item')).find((item) =>
      item.getAttribute('properties')?.split(/\s+/).includes('cover-image') || (coverId && item.getAttribute('id') === coverId));
    const href = coverItem?.getAttribute('href');
    const coverPath = href ? epubResourcePath(href, opfPath) : null;
    if (coverPath && /^(image\/jpeg|image\/png|image\/webp)$/.test(coverItem?.getAttribute('media-type') ?? '')) {
      try {
        const cover = await book.archive.getBlob(coverPath, coverItem?.getAttribute('media-type') ?? undefined);
        if (cover?.size > 0 && cover.size <= 4 * 1024 * 1024) result.cover = cover;
      } catch { /* Capa ausente não impede o cadastro dos metadados. */ }
    }
    return result;
  } finally {
    book.destroy();
  }
}

export function metadataFromPdf(info: Record<string, unknown>, pages: number, filename: string): ImportedMetadata {
  const value = (key: string) => typeof info[key] === 'string' ? info[key].trim() || null : null;
  return { title: value('Title') ?? filename.replace(/\.pdf$/i, ''),
    authors: value('Author') ? [value('Author') as string] : [],
    language: normalizeLanguage(value('Language')), isbn13: toIsbn13(value('ISBN')),
    publisher: null, publicationYear: null, numPages: pages,
    description: value('Subject'), cover: null };
}

export async function extractBookMetadata(file: File): Promise<ImportedMetadata> {
  const format = formatoDoArquivo(file.name);
  const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (format === 'epub') {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Este arquivo não parece ser um EPUB válido.');
    return fromEpub(file);
  }
  if (format !== 'pdf' || new TextDecoder().decode(bytes) !== '%PDF-') throw new Error('Este arquivo não parece ser um PDF válido.');
  const { pdfjs } = await import('react-pdf');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  try {
    const document = await task.promise;
    const { info } = await document.getMetadata();
    return metadataFromPdf(info as Record<string, unknown>, document.numPages, file.name);
  } finally {
    await task.destroy();
  }
}
