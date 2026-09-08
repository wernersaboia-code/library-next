import 'server-only';
import { createClient } from '@supabase/supabase-js';

export const COVERS_BUCKET = 'covers';
export const BOOK_FILES_BUCKET = 'book-files';

export class StorageQuotaError extends Error {
  constructor(message = 'Espaço de armazenamento esgotado') {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL/SERVICE_ROLE_KEY ausentes');
  return createClient(url, key, { auth: { persistSession: false } });
}

function isQuota(msg: string) {
  return /exceeded|quota|maximum allowed size|payload too large/i.test(msg);
}

const COVER_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export async function uploadCover(
  userId: string, bookId: number, buf: Buffer, ext: string
): Promise<string> {
  const contentType = COVER_CONTENT_TYPES[ext];
  if (!contentType) {
    throw new Error(`Extensão de capa não suportada: ${ext}`);
  }
  const path = `${userId}/${bookId}/cover.${ext}`;
  const bucket = client().storage.from(COVERS_BUCKET);
  const { error } = await bucket.upload(path, buf, {
    contentType,
    upsert: true,
  });
  if (error) {
    if (isQuota(error.message)) throw new StorageQuotaError(error.message);
    throw new Error(`Falha ao subir capa: ${error.message}`);
  }
  return bucket.getPublicUrl(path).data.publicUrl;
}

/** Caminho no bucket privado `book-files` para o arquivo de um livro. */
export function bookFilePath(userId: string, bookId: number, ext: string): string {
  return `${userId}/${bookId}/book.${ext}`;
}

/**
 * Sobe o arquivo do livro (EPUB/PDF) para o bucket privado e devolve o
 * caminho no Storage. O bucket não é público: a entrega é por signed URL.
 */
export async function uploadBookFile(
  userId: string, bookId: number, buf: Buffer, ext: 'epub' | 'pdf'
): Promise<string> {
  const mime = ext === 'pdf' ? 'application/pdf' : 'application/epub+zip';
  const path = bookFilePath(userId, bookId, ext);
  const bucket = client().storage.from(BOOK_FILES_BUCKET);
  const { error } = await bucket.upload(path, buf, {
    contentType: mime,
    upsert: true,
  });
  if (error) {
    if (isQuota(error.message)) throw new StorageQuotaError(error.message);
    throw new Error(`Falha ao subir arquivo: ${error.message}`);
  }
  return path;
}

/** Signed URL temporária para um arquivo privado do bucket de livros. */
export async function getSignedBookUrl(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string> {
  const bucket = client().storage.from(BOOK_FILES_BUCKET);
  const { data, error } = await bucket.createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`Falha ao gerar URL de leitura: ${error?.message ?? 'desconhecido'}`);
  }
  return data.signedUrl;
}
