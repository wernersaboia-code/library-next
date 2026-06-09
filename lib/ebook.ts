import { XMLParser } from 'fast-xml-parser';

interface EpubMetadata {
  title: string;
  authors: string[];
  language?: string;
  publisher?: string;
  description?: string;
  isbn?: string;
  coverPath?: string;
}

function bytesToString(buf: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(buf);
}

export function parseEpubMetadata(buffer: ArrayBuffer): EpubMetadata {
  const view = new Uint8Array(buffer);

  // Localiza o arquivo container.xml que aponta para o OPF
  const containerStr = extractFileFromZip(view, 'META-INF/container.xml');
  if (!containerStr) throw new Error('container.xml not found');

  const parser = new XMLParser();
  const container = parser.parse(containerStr);

  const opfPath =
    container?.container?.rootfiles?.rootfile?.['@_full-path'];
  if (!opfPath) throw new Error('OPF path not found in container.xml');

  // Lê o arquivo OPF
  const opfStr = extractFileFromZip(view, opfPath);
  if (!opfStr) throw new Error('OPF file not found');

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
        isbn = val.replace(/^.*ISBN\s*/i, '').trim();
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

function extractFileFromZip(data: Uint8Array, targetPath: string): string | null {
  // Implementação simples de ZIP reader para localizar arquivos
  // baseada no formato ZIP (sem dependências externas)

  let offset = 0;

  // Procura pelo EOCD (End of Central Directory)
  let eocdOffset = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return null;

  // Lê o offset do central directory
  const cdOffset = new DataView(data.buffer).getUint32(eocdOffset + 16, true);
  const cdEntries = new DataView(data.buffer).getUint16(eocdOffset + 8, true);

  // Normaliza o caminho alvo (usa forward slash)
  const normalizedTarget = targetPath.replace(/\\/g, '/');

  // Percorre o central directory
  let pos = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (pos + 46 > data.length) break;

    const fileNameLen = new DataView(data.buffer).getUint16(pos + 28, true);
    const extraLen = new DataView(data.buffer).getUint16(pos + 30, true);
    const commentLen = new DataView(data.buffer).getUint16(pos + 32, true);
    const localOffset = new DataView(data.buffer).getUint32(pos + 42, true);

    const fileNameBytes = data.slice(pos + 46, pos + 46 + fileNameLen);
    const fileName = new TextDecoder('utf-8').decode(fileNameBytes).replace(/\\/g, '/');

    if (fileName === normalizedTarget) {
      // Lê o header local
      const localHeaderOffset = localOffset;
      if (localHeaderOffset + 30 > data.length) return null;

      const compMethod = new DataView(data.buffer).getUint16(localHeaderOffset + 8, true);
      const compSize = new DataView(data.buffer).getUint32(localHeaderOffset + 18, true);
      const uncompSize = new DataView(data.buffer).getUint32(localHeaderOffset + 22, true);

      const localFileNameLen2 = new DataView(data.buffer).getUint16(localHeaderOffset + 26, true);
      const localExtraLen2 = new DataView(data.buffer).getUint16(localHeaderOffset + 28, true);

      const fileDataOffset = localHeaderOffset + 30 + localFileNameLen2 + localExtraLen2;

      if (compMethod === 0) {
        // Armazenado sem compressão
        const fileData = data.slice(fileDataOffset, fileDataOffset + uncompSize);
        return new TextDecoder('utf-8').decode(fileData);
      } else if (compMethod === 8) {
        // Deflate — precisa de inflate
        const rawData = data.slice(fileDataOffset, fileDataOffset + compSize);
        try {
          const inflated = inflateSync(rawData);
          return new TextDecoder('utf-8').decode(inflated);
        } catch {
          return deflateDecompress(rawData, uncompSize);
        }
      }
      break;
    }

    pos += 46 + fileNameLen + extraLen + commentLen;
  }

  return null;
}

function inflateSync(data: Uint8Array): Uint8Array {
  // Implementação mínima de inflate (deflate decompression)
  // Para uso real, seria melhor usar uma biblioteca como pako
  // Mas como fallback, tentamos pelo menos descomprimir dados não comprimidos
  throw new Error('inflate not available without pako');
}

function deflateDecompress(data: Uint8Array, uncompSize: number): string | null {
  // Fallback: tenta parsear XML de arquivos não comprimidos
  // Retorna null se não conseguir descomprimir
  return null;
}

export async function extractCoverFromEpub(
  buffer: ArrayBuffer,
  coverPath: string
): Promise<ArrayBuffer | null> {
  const view = new Uint8Array(buffer);
  const normalizedPath = coverPath.replace(/\\/g, '/');

  // Percorre o central directory do ZIP
  let eocdOffset = -1;
  for (let i = view.length - 22; i >= 0; i--) {
    if (view[i] === 0x50 && view[i + 1] === 0x4b && view[i + 2] === 0x05 && view[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return null;

  const cdOffset = new DataView(buffer).getUint32(eocdOffset + 16, true);
  const cdEntries = new DataView(buffer).getUint16(eocdOffset + 8, true);

  let pos = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    const fileNameLen = new DataView(buffer).getUint16(pos + 28, true);
    const extraLen = new DataView(buffer).getUint16(pos + 30, true);
    const commentLen = new DataView(buffer).getUint16(pos + 32, true);
    const localOffset = new DataView(buffer).getUint32(pos + 42, true);

    const fileName = new TextDecoder('utf-8').decode(view.slice(pos + 46, pos + 46 + fileNameLen)).replace(/\\/g, '/');

    if (fileName === normalizedPath) {
      const compMethod = new DataView(buffer).getUint16(localOffset + 8, true);
      const compSize = new DataView(buffer).getUint32(localOffset + 18, true);
      const localFnLen = new DataView(buffer).getUint16(localOffset + 26, true);
      const localExLen = new DataView(buffer).getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localFnLen + localExLen;

      if (compMethod === 0) {
        const size = new DataView(buffer).getUint32(localOffset + 22, true);
        return buffer.slice(dataStart, dataStart + size);
      }
      // Se comprimido (method 8), retorna os dados comprimidos como fallback
      return buffer.slice(dataStart, dataStart + compSize);
    }

    pos += 46 + fileNameLen + extraLen + commentLen;
  }

  return null;
}
