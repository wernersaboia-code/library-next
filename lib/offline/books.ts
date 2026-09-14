import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface OfflineBook {
  bookId: number;
  title: string;
  format: 'epub' | 'pdf';
  data: ArrayBuffer;
  size: number;
  savedAt: number;
}

interface OfflineDb extends DBSchema {
  books: { key: number; value: OfflineBook };
}

let dbPromise: Promise<IDBPDatabase<OfflineDb>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDb>('book-offline', 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('books')) {
          d.createObjectStore('books', { keyPath: 'bookId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function salvarLivro(livro: OfflineBook): Promise<void> {
  await (await db()).put('books', livro);
}

export async function lerLivro(bookId: number): Promise<OfflineBook | undefined> {
  return (await db()).get('books', bookId);
}

export async function removerLivro(bookId: number): Promise<void> {
  await (await db()).delete('books', bookId);
}

export async function listarLivros(): Promise<OfflineBook[]> {
  const livros = await (await db()).getAll('books');
  return livros.sort((a, b) => b.savedAt - a.savedAt);
}

/** Pede ao navegador para não despejar o cache (best-effort). */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export interface UsoArmazenamento {
  uso: number;
  cota: number | null;
}

/** Uso/cota do Storage API, quando disponível. */
export async function usoArmazenamento(): Promise<UsoArmazenamento | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est) return null;
    return { uso: est.usage ?? 0, cota: est.quota ?? null };
  } catch {
    return null;
  }
}
