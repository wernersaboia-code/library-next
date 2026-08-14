import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books, authors, bookToAuthor } from '@/lib/db/schema';
import { authorId } from '@/lib/authors';
import { errorResponse } from '@/lib/errors';

function inteiroPositivo(v: unknown): number | null | 'invalido' {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return 'invalido';
  return n;
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await req.json();

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'O título é obrigatório' }, { status: 400 });
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

    const nomes: string[] = Array.isArray(body.authors)
      ? body.authors.filter((a: unknown): a is string => typeof a === 'string' && a.trim() !== '')
      : [];

    const bookId = await withUser(userId, async (tx) => {
      const [book] = await tx.insert(books).values({
        userId,
        title,
        title_source: title,
        source: 'manual',
        owned: body.owned === true,
        num_pages: numPages,
        publication_year: publicationYear,
        publisher: typeof body.publisher === 'string' ? body.publisher : null,
        genre: typeof body.genre === 'string' ? body.genre : null,
      }).returning({ id: books.id });

      for (const nome of nomes) {
        const id = authorId(nome);
        await tx.insert(authors).values({ id, name: nome }).onConflictDoNothing();
        await tx.insert(bookToAuthor).values({ bookId: book.id, authorId: id })
          .onConflictDoNothing();
      }
      return book.id;
    });

    return NextResponse.json({ success: true, bookId });
  } catch (err) {
    return errorResponse(err, 'Erro ao criar o livro');
  }
}
