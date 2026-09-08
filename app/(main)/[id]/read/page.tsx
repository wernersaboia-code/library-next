import { notFound } from 'next/navigation';
import { getCurrentUserId } from '@/lib/auth-user';
import { fetchBookById } from '@/lib/db/queries';
import { ReaderClient } from './reader-client';

export default async function ReadPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  const book = await fetchBookById(userId, params.id);
  if (!book) notFound();

  if (!book.has_file) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xl font-semibold">Arquivo ainda não carregado</p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Marque “Preparar para leitura” na página do livro e rode{' '}
          <code className="rounded bg-muted px-1">pnpm db:sync-files</code> no
          computador para subir o arquivo do Calibre.
        </p>
      </div>
    );
  }

  return <ReaderClient bookId={book.id} title={book.title} />;
}
