import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books, authors, bookToAuthor } from '@/lib/db/schema';
import { authorId } from '@/lib/authors';
import { errorResponse } from '@/lib/errors';
import { normalizeText, toIsbn13 } from '@/lib/metadata/util';
import { normalizeLanguage } from '@/lib/languages';
import { sql } from 'drizzle-orm';
import { findDuplicates } from '@/lib/db/duplicates';

function inteiroPositivo(v: unknown): number | null | 'invalido' {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return 'invalido';
  return n;
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Cadastro inválido' }, { status: 400 });
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'O título é obrigatório' }, { status: 400 });
    }

    // Título em língua original — opcional e só para o cadastro manual. O
    // sync do Calibre escreve em campos de catálogo, mas esta rota é manual.
    const originalTitle = typeof body.originalTitle === 'string'
      && body.originalTitle.trim()
      ? body.originalTitle.trim()
      : null;
    const isbn13 = typeof body.isbn13 === 'string' && body.isbn13.trim()
      ? toIsbn13(body.isbn13) : null;
    if (body.isbn13 && !isbn13) {
      return NextResponse.json({ error: 'ISBN inválido' }, { status: 400 });
    }
    const language = typeof body.language === 'string' ? normalizeLanguage(body.language) : null;
    if (body.language && !language) {
      return NextResponse.json({ error: 'Idioma inválido' }, { status: 400 });
    }

    const numPages = inteiroPositivo(body.numPages);
    if (numPages === 'invalido') {
      return NextResponse.json(
        { error: 'Número de páginas deve ser um inteiro positivo' }, { status: 400 });
    }
    const publicationYear = inteiroPositivo(body.publicationYear);
    if (publicationYear === 'invalido') {
      return NextResponse.json(
        { error: 'Ano de publicação deve ser um inteiro positivo' }, { status: 400 });
    }

    // average_rating é decimal(3,2) na escala 0..5
    const avaliacaoExterna = body.averageRating;
    let averageRating: string | null = null;
    if (avaliacaoExterna !== undefined && avaliacaoExterna !== null) {
      const n = Number(avaliacaoExterna);
      if (!Number.isFinite(n) || n < 0 || n > 5) {
        return NextResponse.json(
          { error: 'A nota deve estar entre 0 e 5' }, { status: 400 });
      }
      averageRating = n.toFixed(2);
    }
    const ratingsCount = inteiroPositivo(body.ratingsCount);
    if (ratingsCount === 'invalido') {
      return NextResponse.json(
        { error: 'Número de votos inválido' }, { status: 400 });
    }

    const nomes: string[] = Array.isArray(body.authors)
      ? body.authors.filter((a: unknown): a is string => typeof a === 'string' && a.trim() !== '')
      : [];

    const sha256 = typeof body.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(body.sha256)
      ? body.sha256.toLowerCase() : null;
    const result = await withUser(userId, async (tx) => {
      if (body.checkDuplicates === true) {
        // Duas tentativas simultâneas do mesmo cadastro não passam pela
        // verificação antes que a outra tenha terminado de gravar.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}), hashtext(${normalizeText(title)}))`);
        const duplicates = await findDuplicates(tx, userId, { title, authors: nomes, isbn13, sha256 });
        if (duplicates.length && body.allowDuplicate !== true) return { duplicates };
      }
      const [book] = await tx.insert(books).values({
        userId,
        title,
        title_source: title,
        original_title: originalTitle,
        isbn13,
        language_code: language,
        description: typeof body.description === 'string' ? body.description.trim() || null : null,
        source: 'manual',
        owned: body.owned === true,
        num_pages: numPages,
        publication_year: publicationYear,
        publisher: typeof body.publisher === 'string' ? body.publisher : null,
        genre: typeof body.genre === 'string' ? body.genre : null,
        average_rating: averageRating,
        ratings_count: ratingsCount,
      }).returning({ id: books.id });

      for (const nome of nomes) {
        const id = authorId(nome);
        await tx.insert(authors).values({ id, name: nome }).onConflictDoNothing();
        await tx.insert(bookToAuthor).values({ bookId: book.id, authorId: id })
          .onConflictDoNothing();
      }
      return { bookId: book.id };
    });
    if ('duplicates' in result) return NextResponse.json({ duplicates: result.duplicates }, { status: 409 });
    return NextResponse.json({ success: true, bookId: result.bookId });
  } catch (err) {
    return errorResponse(err, 'Erro ao criar o livro');
  }
}
