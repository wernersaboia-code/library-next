import Link from 'next/link';
import { BookCaption } from './book-caption';
import { Photo } from './photo';
import type { BrowseBook } from '@/lib/db/catalog-browse';

export function CatalogGroupBooks({ books, returnHref, showVolume = false }: { books: BrowseBook[]; returnHref: string; showVolume?: boolean }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
    {books.map((book, index) => <Link key={book.id} href={`/${book.id}?${new URLSearchParams({ from: returnHref })}`}
      className="block transition ease-in-out md:hover:scale-[1.02]">
      <Photo bookId={book.id} src={book.image_url} title={book.title} thumbhash={book.thumbhash} priority={index < 10}
        readStatus={book.read_status} myRating={book.my_rating} owned={book.owned} nextUp={book.next_up} favorite={book.favorite} />
      <BookCaption titulo={book.title} autores={book.authors} />
      {showVolume && book.series_index !== null && <p className="text-xs text-muted-foreground">Volume {book.series_index.toLocaleString('pt-BR')}</p>}
    </Link>)}
  </div>;
}
