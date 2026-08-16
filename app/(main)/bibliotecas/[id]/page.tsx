import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, LibraryIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Photo } from '@/components/photo';
import { BookCaption } from '@/components/book-caption';
import { EmptyState } from '@/components/empty-state';
import { getCurrentUserId } from '@/lib/auth-user';
import { fetchCollection, fetchCollectionBooks } from '@/lib/db/collections';

export default async function BibliotecaPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const collectionId = Number(id);
  if (!Number.isInteger(collectionId) || collectionId <= 0) notFound();

  const userId = await getCurrentUserId();
  const biblioteca = await fetchCollection(userId, collectionId);
  if (!biblioteca) notFound();

  const livros = await fetchCollectionBooks(userId, collectionId);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link href="/bibliotecas">
            <ArrowLeftIcon className="mr-2 h-4 w-4" /> Bibliotecas
          </Link>
        </Button>
        <Link
          href={`/?bib=${collectionId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Ver no catálogo com filtros
        </Link>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{biblioteca.name}</h1>
        <p className="text-sm text-muted-foreground">
          {livros.length} {livros.length === 1 ? 'livro' : 'livros'}
        </p>
      </div>

      {livros.length === 0 ? (
        <EmptyState
          icone={LibraryIcon}
          titulo="Nenhum livro aqui ainda"
          descricao="Use o modo de seleção no catálogo para adicionar vários de uma vez."
        />
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {livros.map((livro, index) => (
            <Link
              key={livro.id}
              href={`/${livro.id}`}
              className="block transition ease-in-out md:hover:scale-105"
            >
              <Photo
                src={livro.image_url}
                title={livro.title}
                thumbhash={livro.thumbhash}
                priority={index < 10}
                readStatus={livro.read_status}
                myRating={livro.my_rating}
                owned={livro.owned}
                nextUp={livro.next_up}
                favorite={livro.favorite}
              />
              <BookCaption titulo={livro.title} autores={livro.authors} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
