import {
  StarIcon,
  BookOpenIcon,
  GlobeIcon,
  CalendarIcon,
  ArrowLeftIcon,
  LayersIcon,
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
import { BookCollections } from './book-collections';
import { ProgressControls } from './progress-controls';
import { OriginalTitleEditor } from './original-title';
import { sanitizeDescription } from '@/lib/description';
import { fetchCollections } from '@/lib/db/collections';
import { fetchNotes } from '@/lib/db/notes';

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
  const bookId = Number(params.id);
  // As notas entram no mesmo fetch da página (AD do painel): renderizá-las
  // aqui evita o round-trip no cliente + o flash "Carregando notas...".
  const [book, bibliotecas, notas] = await Promise.all([
    fetchBookById(userId, params.id),
    fetchCollections(userId),
    Number.isInteger(bookId) && bookId > 0
      ? fetchNotes(userId, bookId)
      : Promise.resolve([]),
  ]);
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
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-2">
            {book.title}
          </h1>
          <OriginalTitleEditor bookId={book.id} inicial={book.original_title} />
          <div className="text-lg md:text-xl mb-4">
            {book.authors.map((author, index) => (
              <span key={author}>
                {author}
                {index < book.authors.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>

          {book.series && (
            <p className="flex items-center text-sm text-muted-foreground mb-4">
              <LayersIcon className="w-4 h-4 mr-2" />
              Série: {book.series}
              {book.series_index !== null &&
                `, volume ${book.series_index.toLocaleString('pt-BR')}`}
            </p>
          )}

          <BookCollections
            bookId={book.id}
            atuais={book.collections}
            todas={bibliotecas.map((b) => ({ id: b.id, name: b.name }))}
          />

          <div className="flex items-center mb-4">
            <StarRating rating={book.average_rating} />
            <span className="text-lg font-semibold">
              {Number(book.average_rating).toFixed(1)}
            </span>
            <span className="text-muted-foreground ml-2">
              ({Number(book.ratings_count).toLocaleString()} avaliações)
            </span>
          </div>

          {/* A descrição do Calibre é HTML. Sanitizada no servidor
              (lib/description.ts) porque veio de metadados de terceiros. */}
          <div
            className="text-foreground/80 mb-6 space-y-3 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc"
            dangerouslySetInnerHTML={{
              __html: sanitizeDescription(book.description),
            }}
          />

          <TrackingControls
            bookId={book.id}
            initial={{
              readStatus: book.read_status,
              dateStarted: book.date_started,
              dateFinished: book.date_finished,
              myRating: book.my_rating,
              dnfReason: book.dnf_reason,
              nextUp: book.next_up,
              favorite: book.favorite,
              owned: book.owned,
            }}
          />

          <ProgressControls
            bookId={book.id}
            numPages={book.num_pages}
            initial={{
              readStatus: book.read_status,
              progressPercent: book.progress_percent,
              progressUpdatedAt: book.progress_updated_at
                ? book.progress_updated_at.toISOString()
                : null,
            }}
          />

          <div className="mb-6 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
              <BookOpenIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
              {book.num_pages} páginas
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
              <GlobeIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
              {getLanguageLabel(book.language_code)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
              {book.publication_year}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
              ISBN: {book.isbn || 'Nenhum'}
            </span>
          </div>

          <NotesSection bookId={book.id} initial={notas} />
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
              : 'text-muted-foreground/40'
          }`}
        />
      ))}
    </div>
  );
}
