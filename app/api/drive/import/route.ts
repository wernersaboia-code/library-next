import { auth } from '@/lib/auth';
import { fetchFileBuffer, getDriveDownloadUrl } from '@/lib/drive';
import { parseEpubMetadata, extractCoverFromEpub } from '@/lib/ebook';
import { db } from '@/lib/db/drizzle';
import { books, authors, bookToAuthor, driveFiles } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { fileId, fileName, mimeType } = await req.json();
  if (!fileId || !mimeType)
    return NextResponse.json({ error: 'fileId e mimeType obrigatórios' }, { status: 400 });

  // Verifica se já foi importado
  const existing = await db
    .select({ id: driveFiles.id })
    .from(driveFiles)
    .where(sql`${driveFiles.fileId} = ${fileId}`)
    .limit(1);

  if (existing.length > 0)
    return NextResponse.json({ error: 'Livro já importado' }, { status: 409 });

  try {
    if (mimeType === 'application/epub+zip') {
      const buffer = await fetchFileBuffer(session.accessToken, fileId);
      const meta = parseEpubMetadata(buffer);

      // Insere o livro
      const [book] = await db
        .insert(books)
        .values({
          title: meta.title,
          description: meta.description,
          language_code: meta.language,
          publisher: meta.publisher,
          isbn: meta.isbn,
          title_tsv: meta.title,
        })
        .returning({ id: books.id });

      // Insere autor(es)
      for (const authorName of meta.authors) {
        const [author] = await db
          .insert(authors)
          .values({ id: crypto.randomUUID(), name: authorName })
          .onConflictDoNothing({ target: authors.name })
          .returning({ id: authors.id });

        if (author) {
          await db
            .insert(bookToAuthor)
            .values({ bookId: book.id, authorId: author.id })
            .onConflictDoNothing();
        }
      }

      // Extrai e salva a capa
      if (meta.coverPath) {
        const coverBuffer = await extractCoverFromEpub(buffer, meta.coverPath);
        if (coverBuffer) {
          const base64 = Buffer.from(coverBuffer).toString('base64');
          const ext = meta.coverPath.split('.').pop() || 'png';
          await db
            .update(books)
            .set({ image_url: `/api/cover/${book.id}.${ext}?data=${base64}` })
            .where(sql`${books.id} = ${book.id}`);
        }
      }

      // Registra o arquivo do Drive
      await db.insert(driveFiles).values({
        bookId: book.id,
        fileId,
        mimeType,
        size: null,
        modifiedTime: null,
      });

      return NextResponse.json({ success: true, bookId: book.id, title: meta.title });
    }

    return NextResponse.json({ error: 'Formato não suportado' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Erro ao importar', details: String(err) },
      { status: 500 }
    );
  }
}
