import { XMLParser } from 'fast-xml-parser';
import { unzipSync, strFromU8 } from 'fflate';

interface EpubMetadata {
  title: string;
  authors: string[];
  language?: string;
  publisher?: string;
  description?: string;
  isbn?: string;
  coverPath?: string;
}

export function parseEpubMetadata(buffer: ArrayBuffer): EpubMetadata {
  // fflate.unzipSync descomprime tanto STORE quanto DEFLATE — os dois
  // métodos de compressão usados por EPUBs reais (o Google Drive costuma
  // entregar DEFLATE).
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error('container.xml not found');
  }

  // Localiza o arquivo container.xml que aponta para o OPF
  const containerBytes = files['META-INF/container.xml'];
  if (!containerBytes) throw new Error('container.xml not found');
  const containerStr = strFromU8(containerBytes);

  // ignoreAttributes: false é obrigatório — todo o metadado do EPUB vive em
  // atributos (full-path, href, media-type, id). Com o default (true) o
  // parser descarta esses atributos e o import quebra para qualquer arquivo.
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const container = parser.parse(containerStr);

  const opfPath =
    container?.container?.rootfiles?.rootfile?.['@_full-path'];
  if (!opfPath) throw new Error('OPF path not found in container.xml');

  // Lê o arquivo OPF
  const opfBytes = files[opfPath];
  if (!opfBytes) throw new Error('OPF file not found');
  const opfStr = strFromU8(opfBytes);

  const opf = parser.parse(opfStr);
  const metadata = opf?.package?.metadata || opf?.opf?.metadata || {};

  // Título
  const title =
    metadata['dc:title'] || metadata.title || 'Sem título';

  // Autores
  const authorRaw = metadata['dc:creator'] || metadata.creator;
  const authors = Array.isArray(authorRaw)
    ? authorRaw.map((a: any) => (typeof a === 'string' ? a : a['#text'] || a))
    : [typeof authorRaw === 'string' ? authorRaw : authorRaw?.['#text'] || 'Autor desconhecido'];

  // Idioma
  const language = metadata['dc:language'] || metadata.language;

  // Editora
  const publisher = metadata['dc:publisher'] || metadata.publisher;

  // Descrição
  const description =
    metadata['dc:description'] || metadata.description;

  // ISBN — busca em dc:identifier
  let isbn: string | undefined;
  const identifiers = metadata['dc:identifier'];
  if (identifiers) {
    const ids = Array.isArray(identifiers) ? identifiers : [identifiers];
    for (const id of ids) {
      const val = typeof id === 'string' ? id : id['#text'] || '';
      if (val.includes('ISBN')) {
        isbn = val.replace(/^.*ISBN[:\s]*/i, '').trim();
        break;
      }
    }
  }

  // Capa — busca a imagem de capa referenciada no OPF
  let coverPath: string | undefined;
  const manifest = opf?.package?.manifest?.item || opf?.opf?.manifest?.item || [];
  const items = Array.isArray(manifest) ? manifest : [manifest];

  for (const item of items) {
    const id = item['@_id']?.toLowerCase() || '';
    const href = item['@_href'];
    const mediaType = item['@_media-type'] || '';
    if (
      id.includes('cover') &&
      mediaType.startsWith('image/') &&
      href
    ) {
      // Calcula o caminho relativo ao OPF
      const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
      coverPath = opfDir + href;
      break;
    }
  }

  return { title, authors, language, publisher, description, isbn, coverPath };
}

export async function extractCoverFromEpub(
  buffer: ArrayBuffer,
  coverPath: string
): Promise<ArrayBuffer | null> {
  const normalizedPath = coverPath.replace(/\\/g, '/');

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch {
    return null;
  }

  const bytes = files[normalizedPath];
  if (!bytes) return null;

  // fflate já devolve os bytes descomprimidos, seja STORE ou DEFLATE.
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
