import 'server-only';
import { and, eq } from 'drizzle-orm';
import { withUser } from '@/lib/db/with-user';
import { db } from '@/lib/db/drizzle';
import { books, authors, bookToAuthor, driveFiles } from '@/lib/db/schema';
import { parseEpubMetadata, extractCoverFromEpub } from '@/lib/ebook';
import { fetchFileBuffer } from '@/lib/drive';
import { uploadCover, uploadBookFile } from '@/lib/storage';
import { pdfPageCount } from '@/lib/pdf-meta';

export interface ImportParams {
  userId: string;
  accessToken: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface ImportResult {
  bookId: number;
  title: string;
  cached: boolean;
}

export class AlreadyImportedError extends Error {
  constructor(public readonly bookId: number) {
    super('Livro já importado');
    this.name = 'AlreadyImportedError';
  }
}

/** Id determinístico e estável — a mesma grafia sempre gera o mesmo id. */
export function authorId(name: string): string {
  return (
    name.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      .slice(0, 50) || 'desconhecido'
  );
}

function cacheLimit(): number {
  return Number(process.env.DRIVE_CACHE_MAX_BYTES ?? 52_428_800);
}

export async function importBook(p: ImportParams): Promise<ImportResult> {
  const existing = await withUser(p.userId, (tx) =>
    tx.select({ bookId: driveFiles.bookId })
      .from(driveFiles)
      .where(eq(driveFiles.fileId, p.fileId))
      .limit(1)
  );
  if (existing.length > 0) throw new AlreadyImportedError(existing[0].bookId);

  const buffer = await fetchFileBuffer(p.accessToken, p.fileId);

  interface Parsed {
    title: string;
    authors: string[];
    language?: string;
    publisher?: string;
    description?: string;
    isbn?: string;
    coverPath?: string;
    numPages: number | null;
  }

  let parsed: Parsed;

  if (p.mimeType === 'application/epub+zip') {
    const meta = parseEpubMetadata(buffer); // lança se malformado
    parsed = { ...meta, numPages: null };
  } else if (p.mimeType === 'application/pdf') {
    parsed = {
      title: p.fileName.replace(/\.pdf$/i, '').trim() || 'Sem título',
      authors: [],
      numPages: await pdfPageCount(buffer),
    };
  } else {
    throw new Error(`Formato não suportado: ${p.mimeType}`);
  }

  // Autores são globais e não têm RLS — inserção fora de withUser, por id.
  const authorIds: string[] = [];
  for (const name of parsed.authors) {
    const id = authorId(name);
    // #7: ON CONFLICT pela PK (id), nunca por authors.name (sem UNIQUE).
    await db.insert(authors).values({ id, name }).onConflictDoNothing();
    // #7b: o id é conhecido de antemão, sem depender de `returning`; o
    // vínculo é criado mesmo quando o autor já existia.
    authorIds.push(id);
  }

  const bookId = await withUser(p.userId, async (tx) => {
    const [book] = await tx.insert(books).values({
      userId: p.userId,
      title: parsed.title,
      title_source: parsed.title,
      description: parsed.description ?? null,
      language_code: parsed.language ?? null,
      publisher: parsed.publisher ?? null,
      isbn: parsed.isbn ?? null,
      num_pages: parsed.numPages,
    }).returning({ id: books.id });

    for (const id of authorIds) {
      await tx.insert(bookToAuthor)
        .values({ bookId: book.id, authorId: id })
        .onConflictDoNothing();
    }

    await tx.insert(driveFiles).values({
      userId: p.userId,
      bookId: book.id,
      fileId: p.fileId,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes ?? buffer.byteLength,
    });

    return book.id;
  });

  // #8: a capa vai para o Storage e a image_url guarda a URL pública — nunca
  // base64 embutido apontando para uma rota inexistente.
  //
  // Degradação: falha de Storage (qualquer erro, não só quota) nunca derruba
  // o import. O livro e os metadados já persistiram; a capa é dispensável.
  if (parsed.coverPath) {
    try {
      const cover = await extractCoverFromEpub(buffer, parsed.coverPath);
      if (cover) {
        const ext = parsed.coverPath.split('.').pop()?.toLowerCase() === 'png'
          ? 'png' : 'jpg';
        const url = await uploadCover(p.userId, bookId, Buffer.from(cover), ext);
        await withUser(p.userId, (tx) =>
          tx.update(books).set({ image_url: url }).where(eq(books.id, bookId)));
      }
    } catch (err) {
      console.warn(JSON.stringify({
        level: 'warn',
        stage: 'cover-upload',
        bookId,
        fileId: p.fileId,
        message: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  // Cache no Storage: arquivos até o limite são copiados; acima ficam só no
  // Drive. Qualquer falha aqui degrada para cached=false sem abortar.
  let cached = false;
  const size = p.sizeBytes ?? buffer.byteLength;
  if (size <= cacheLimit()) {
    try {
      const path = await uploadBookFile(
        p.userId, bookId, Buffer.from(buffer), p.mimeType
      );
      await withUser(p.userId, (tx) =>
        tx.update(driveFiles).set({ cachedPath: path })
          .where(and(
            eq(driveFiles.bookId, bookId),
            eq(driveFiles.fileId, p.fileId)
          )));
      cached = true;
    } catch (err) {
      console.warn(JSON.stringify({
        level: 'warn',
        stage: 'file-cache',
        bookId,
        fileId: p.fileId,
        message: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  return { bookId, title: parsed.title, cached };
}
