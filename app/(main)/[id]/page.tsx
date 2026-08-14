import {
  StarIcon,
  BookOpenIcon,
  GlobeIcon,
  CalendarIcon,
  ArrowLeftIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchBookById } from '@/lib/db/queries';
import { Photo } from '@/components/photo';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { SearchParams, stringifySearchParams } from '@/lib/url-state';
import { getCurrentUserId } from '@/lib/auth-user';
import { notFound } from 'next/navigation';
import { TrackingControls } from './tracking-controls';
import { NotesSection } from './notes-section';

const LANGUAGES = [
  { value: 'en', label: 'Inglês' },
  { value: 'spa', label: 'Espanhol' },
  { value: 'ita', label: 'Italiano' },
  { value: 'ara', label: 'Árabe' },
  { value: 'fre', label: 'Francês' },
  { value: 'ger', label: 'Alemão' },
  { value: 'ind', label: 'Indonésio' },
  { value: 'por', label: 'Português' },
];

function getLanguageLabel(code: string | null): string {
  if (!code) return 'Desconhecido';
  const language = LANGUAGES.find((lang) => lang.value === code.toLowerCase());
  return language ? language.label : 'Desconhecido';
}

export default async function Page(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<SearchParams>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const userId = await getCurrentUserId();
  const book = await fetchBookById(userId, params.id);
  if (!book) notFound();

  return (
    <ScrollArea className="px-4 h-full">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" asChild>
          <Link href={`/?${stringifySearchParams(searchParams)}`}>
            <ArrowLeftIcon className="mr-2 h-4 w-4" /> Voltar
          </Link>
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-1/2 md:w-1/4 mx-auto md:mx-0">
          <Photo
            src={book.image_url}
            title={book.title}
            thumbhash={book.thumbhash}
            priority={true}
            readStatus={book.read_status}
            myRating={book.my_rating}
          />
        </div>

        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">{book.title}</h1>
          <div className="text-lg md:text-xl mb-4">
            {book.authors.map((author, index) => (
              <span key={author}>
                {author}
                {index < book.authors.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>

          <div className="flex items-center mb-4">
            <StarRating rating={book.average_rating} />
            <span className="text-lg font-semibold">
              {Number(book.average_rating).toFixed(1)}
            </span>
            <span className="text-gray-600 ml-2">
              ({Number(book.ratings_count).toLocaleString()} avaliações)
            </span>
          </div>

          <p className="text-gray-700 mb-6">{book.description}</p>

          <TrackingControls
            bookId={book.id}
            initial={{
              readStatus: book.read_status,
              dateStarted: book.date_started,
              dateFinished: book.date_finished,
              myRating: book.my_rating,
            }}
          />

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="flex items-center">
              <BookOpenIcon className="w-5 h-5 mr-2 text-gray-600" />
              <span>{book.num_pages} páginas</span>
            </div>
            <div className="flex items-center">
              <GlobeIcon className="w-5 h-5 mr-2 text-gray-600" />
              <span>{getLanguageLabel(book.language_code)}</span>
            </div>
            <div className="flex items-center">
              <CalendarIcon className="w-5 h-5 mr-2 text-gray-600" />
              <span>{book.publication_year}</span>
            </div>
            <div className="flex items-center">
              <span>ISBN: {book.isbn || 'Nenhum'}</span>
            </div>
          </div>

          <NotesSection bookId={book.id} />
        </div>
      </div>
    </ScrollArea>
  );
}

function StarRating({ rating }: { rating: string | null }) {
  if (rating === null) return null;

  return (
    <div className="flex items-center mr-4">
      {[...Array(5)].map((_, i) => (
        <StarIcon
          key={i}
          className={`w-5 h-5 ${
            i < Math.floor(Number(rating))
              ? 'text-yellow-400 fill-current'
              : 'text-gray-300'
          }`}
        />
      ))}
    </div>
  );
}
