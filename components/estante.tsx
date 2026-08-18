import Link from 'next/link';
import { BookOpenIcon } from 'lucide-react';
import { Photo } from '@/components/photo';
import { BookCaption } from './book-caption';
import { EmptyState } from './empty-state';
import type { LivroDaEstante } from '@/lib/db/queries';

/**
 * Grade de capas das estantes curtas (fila e favoritos).
 *
 * As marcas de fila e favorito ficam de fora de propósito: numa página em
 * que todos os livros têm a mesma marca, ela não distingue nada.
 */
export function Estante({
  livros,
  vazio,
  icone = BookOpenIcon,
}: {
  livros: LivroDaEstante[];
  vazio: string;
  icone?: React.ElementType;
}) {
  if (livros.length === 0) {
    return <EmptyState icone={icone} titulo="Nada por aqui ainda" descricao={vazio} />;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
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
          />
          <BookCaption titulo={livro.title} autores={livro.authors} />
        </Link>
      ))}
    </div>
  );
}
