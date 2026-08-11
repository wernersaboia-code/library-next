import 'server-only';
import { createClient } from '@supabase/supabase-js';

export const COVERS_BUCKET = 'covers';
export const BOOKS_BUCKET = 'books';

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

const EXT: Record<string, string> = {
  'application/epub+zip': 'epub',
  'application/pdf': 'pdf',
};

function isQuota(msg: string) {
  return /exceeded|quota|maximum allowed size|payload too large/i.test(msg);
}

export async function uploadCover(
  userId: string, bookId: number, buf: Buffer, ext: string
): Promise<string> {
  const path = `${userId}/${bookId}/cover.${ext}`;
  const bucket = client().storage.from(COVERS_BUCKET);
  const { error } = await bucket.upload(path, buf, {
    contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
    upsert: true,
  });
  if (error) {
    if (isQuota(error.message)) throw new StorageQuotaError(error.message);
    throw new Error(`Falha ao subir capa: ${error.message}`);
  }
  return bucket.getPublicUrl(path).data.publicUrl;
}

export async function uploadBookFile(
  userId: string, bookId: number, buf: Buffer, mimeType: string
): Promise<string> {
  const ext = EXT[mimeType];
  if (!ext) throw new Error(`Mime type não suportado: ${mimeType}`);
  const path = `${userId}/${bookId}/book.${ext}`;
  const { error } = await client().storage
    .from(BOOKS_BUCKET)
    .upload(path, buf, { contentType: mimeType, upsert: true });
  if (error) {
    if (isQuota(error.message)) throw new StorageQuotaError(error.message);
    throw new Error(`Falha ao subir arquivo: ${error.message}`);
  }
  return path;
}

export async function createSignedUrl(
  path: string, expiresInSeconds = 3600
): Promise<string> {
  const { data, error } = await client().storage
    .from(BOOKS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`Falha ao gerar URL assinada: ${error?.message}`);
  }
  return data.signedUrl;
}
