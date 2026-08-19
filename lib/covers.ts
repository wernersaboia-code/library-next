import 'server-only';
import sharp from 'sharp';
import * as ThumbHash from 'thumbhash';
import { eq } from 'drizzle-orm';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { uploadCover } from '@/lib/storage';

export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;

const OPENLIBRARY_COVER_HOST = 'https://covers.openlibrary.org';

async function gerarThumbhash(buf: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(buf)
      .resize(100, 100, { fit: 'inside' }).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    return Buffer.from(
      ThumbHash.rgbaToThumbHash(info.width, info.height, data)
    ).toString('base64');
  } catch {
    return null;
  }
}

export async function applyCoverFromBuffer(
  userId: string, bookId: number, buf: Buffer, ext: 'jpg' | 'png'
): Promise<string> {
  const thumbhash = await gerarThumbhash(buf);
  const imageUrl = await uploadCover(userId, bookId, buf, ext);
  await withUser(userId, (tx) =>
    tx.update(books).set({ image_url: imageUrl, thumbhash })
      .where(eq(books.id, bookId)));
  return imageUrl;
}

/**
 * O host é fixo e o id é numérico: o cliente nunca fornece a URL (AD-7).
 * Aceitar endereço do cliente aqui seria SSRF.
 */
export async function fetchOpenLibraryCover(coverId: number): Promise<Buffer> {
  const url = `${OPENLIBRARY_COVER_HOST}/b/id/${coverId}-L.jpg`;
  // A rota completa de capa levou 11 741 ms na medição de 2026-08-19, contra
  // o limite anterior de 10 s — por isso nenhum dos livros vindos da busca
  // tinha capa. 20 s dá ~1,7x a chamada observada.
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Capa indisponível (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
