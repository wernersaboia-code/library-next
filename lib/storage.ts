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

/** Buckets que a aplicação espera. `covers` é público; `book-files`, privado. */
const BUCKETS = [
  { name: COVERS_BUCKET, public: true },
  { name: BOOK_FILES_BUCKET, public: false },
] as const;

/**
 * Cria os buckets que faltarem (idempotente). Precisa do service role: o
 * Storage não expõe criação de bucket ao cliente. Rodado por
 * `pnpm db:setup-storage` — sem isso, `uploadBookFile` falha com
 * "Bucket not found".
 */
export async function ensureStorageBuckets(): Promise<string[]> {
  const admin = client();
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw new Error(`Falha ao listar buckets: ${error.message}`);

  const existentes = new Set((data ?? []).map((b) => b.name));
  const criados: string[] = [];
  for (const bucket of BUCKETS) {
    if (existentes.has(bucket.name)) continue;
    const { error: erroCriacao } = await admin.storage.createBucket(bucket.name, {
      public: bucket.public,
    });
    if (erroCriacao) {
      throw new Error(`Falha ao criar bucket ${bucket.name}: ${erroCriacao.message}`);
    }
    criados.push(bucket.name);
  }
  return criados;
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

export interface StorageObject {
  path: string;
  size: number;
}

/** Baixa o conteúdo de um objeto de um bucket. */
export async function downloadObject(bucketName: string, path: string): Promise<Buffer> {
  const bucket = client().storage.from(bucketName);
  const { data, error } = await bucket.download(path);
  if (error || !data) {
    throw new Error(`Falha ao baixar ${bucketName}/${path}: ${error?.message ?? 'desconhecido'}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

const LIST_PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 1000;
const LIST_RETRY_DELAYS_MS = [0, 500, 1500, 3000, 6000];

function erroTransitorio(msg: string): boolean {
  return /timeout|gateway|bad gateway|service unavailable|network|fetch failed|econnreset|etimedout|50[234]|rate limit|too many/i.test(
    msg
  );
}

/**
 * Lista recursivamente todos os objetos de um bucket, com o tamanho em bytes.
 * O `list` do Storage não desce em subpastas: pastas vêm como entradas sem
 * `id`/`metadata` e são percorridas por conta própria. Pagina em blocos de
 * 1000 para não cortar bibliotecas grandes.
 *
 * São milhares de chamadas (uma por pasta), então cada uma é retentada com
 * backoff: sem isso, um único 504 no meio derrubava a varredura inteira.
 */
export async function listAllObjects(bucketName: string): Promise<StorageObject[]> {
  const bucket = client().storage.from(bucketName);
  const objetos: StorageObject[] = [];

  async function listar(prefix: string, offset: number) {
    let ultimoErro = 'erro desconhecido';
    for (const delay of LIST_RETRY_DELAYS_MS) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      const { data, error } = await bucket.list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (!error) return data ?? [];
      ultimoErro = error.message;
      if (!erroTransitorio(error.message)) break;
    }
    throw new Error(`Falha ao listar ${bucketName}/${prefix}: ${ultimoErro}`);
  }

  async function walk(prefix: string): Promise<void> {
    let offset = 0;
    for (;;) {
      const data = await listar(prefix, offset);
      if (data.length === 0) return;

      for (const item of data) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        const metadata = item.metadata as { size?: number } | null;
        // Pasta: o Storage devolve `id` e `metadata` nulos.
        if (!item.id && !metadata) {
          await walk(path);
        } else {
          objetos.push({ path, size: Number(metadata?.size ?? 0) });
        }
      }

      if (data.length < LIST_PAGE_SIZE) return;
      offset += data.length;
    }
  }

  await walk('');
  return objetos;
}

/** Remove objetos de um bucket em lotes. Retorna quantos foram removidos. */
export async function removeObjects(
  bucketName: string,
  paths: string[]
): Promise<number> {
  if (paths.length === 0) return 0;
  const bucket = client().storage.from(bucketName);
  let removidos = 0;
  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const lote = paths.slice(i, i + REMOVE_BATCH_SIZE);
    const { data, error } = await bucket.remove(lote);
    if (error) {
      throw new Error(`Falha ao remover de ${bucketName}: ${error.message}`);
    }
    removidos += data?.length ?? lote.length;
  }
  return removidos;
}
