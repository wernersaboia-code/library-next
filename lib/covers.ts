import 'server-only';
import sharp from 'sharp';
import * as ThumbHash from 'thumbhash';
import { eq } from 'drizzle-orm';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { uploadCover } from '@/lib/storage';

export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;

// As capas são exibidas em miniatura (grid/leitor): guardar o original em
// resolução cheia é o que enchia o bucket. Normalizamos para no máximo
// 800x1200 em JPEG — sobra para telas HiDPI e derruba o tamanho em ~10x.
export const COVER_MAX_WIDTH = 800;
export const COVER_MAX_HEIGHT = 1200;
export const COVER_JPEG_QUALITY = 80;

const OPENLIBRARY_COVER_HOST = 'https://covers.openlibrary.org';

/**
 * Redimensiona e recomprime uma capa. Se o buffer não for uma imagem
 * decodificável, devolve-o intacto (melhor guardar algo do que derrubar o
 * sync); o `ext` é sempre 'jpg' para casar com a saída normalizada.
 */
export async function normalizarCapa(buf: Buffer): Promise<{ buf: Buffer; ext: 'jpg' }> {
  try {
    const normalizada = await sharp(buf)
      .rotate() // aplica a orientação do EXIF antes de redimensionar
      .resize({
        width: COVER_MAX_WIDTH,
        height: COVER_MAX_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: COVER_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return { buf: normalizada, ext: 'jpg' };
  } catch {
    return { buf, ext: 'jpg' };
  }
}

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
  userId: string, bookId: number, buf: Buffer
): Promise<string> {
  const thumbhash = await gerarThumbhash(buf);
  const { buf: normalizada, ext } = await normalizarCapa(buf);
  const imageUrl = await uploadCover(userId, bookId, normalizada, ext);
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
