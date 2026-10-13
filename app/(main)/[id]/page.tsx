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
import { BookmarksSection } from './bookmarks-section';
import { BookCollections } from './book-collections';
import { ProgressControls } from './progress-controls';
import { OriginalTitleEditor } from './original-title';
import { ReadingAction } from './reading-action';
import { sanitizeDescription } from '@/lib/description';
import { fetchCollections } from '@/lib/db/collections';
import { fetchNotes } from '@/lib/db/notes';
import { fetchBookmarks } from '@/lib/db/bookmarks';
import { TAMANHO_MAXIMO_PADRAO } from '@/lib/arquivo-do-livro';
import { authorHref, browseReturnHref, seriesHref } from '@/lib/catalog-browse';

// Mesmo teto do comando local e da rota de envio: a tela recusa o arquivo antes
// de subir 20 MB de dados móveis, e a rota recusa de novo.
const TAMANHO_MAXIMO_ARQUIVO = Number(
  process.env.BOOK_FILE_MAX_BYTES ?? TAMANHO_MAXIMO_PADRAO
);

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
    searchParams: Promise<SearchParams & { from?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { from, ...catalogParams } = searchParams;
  const returnHref = browseReturnHref(from) ?? `/?${stringifySearchParams(catalogParams)}`;
  const params = await props.params;
  const userId = await getCurrentUserId();
  const bookId = Number(params.id);
  // As notas entram no mesmo fetch da página (AD do painel): renderizá-las
  // aqui evita o round-trip no cliente + o flash "Carregando notas...".
  const [book, bibliotecas, notas, marcadores] = await Promise.all([
    fetchBookById(userId, params.id),
    fetchCollections(userId),
    Number.isInteger(bookId) && bookId > 0
      ? fetchNotes(userId, bookId)
      : Promise.resolve([]),
    Number.isInteger(bookId) && bookId > 0
      ? fetchBookmarks(userId, bookId)
      : Promise.resolve([]),
  ]);
  if (!book) notFound();

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-5xl px-1 pb-10">
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href={returnHref}>
              <ArrowLeftIcon className="mr-2 h-4 w-4" /> Voltar
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
          <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-48">
            <Photo
              bookId={book.id}
              src={book.image_url}
              title={book.title}
              thumbhash={book.thumbhash}
              priority={true}
              readStatus={book.read_status}
              myRating={book.my_rating}
            />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-3xl font-bold leading-tight tracking-tight md:text-4xl">
              {book.title}
            </h1>
            <OriginalTitleEditor bookId={book.id} inicial={book.original_title} />
            {book.authors.length > 0 && (
              <p className="mt-2 text-lg text-muted-foreground">
                {book.authorLinks.map((author, index) => <span key={author.id}>
                  {index > 0 && ', '}
                  <Link href={authorHref(author.id)} className="underline-offset-4 hover:underline">{author.name}</Link>
                </span>)}
              </p>
            )}

            {book.series?.trim() && (
              <p className="mt-2 flex items-center text-sm text-muted-foreground">
                <LayersIcon className="mr-2 h-4 w-4" aria-hidden />
                Série: <Link href={seriesHref(book.series)} className="ml-1 underline-offset-4 hover:underline">{book.series}</Link>
                {book.series_index !== null &&
                  `, volume ${book.series_index.toLocaleString('pt-BR')}`}
              </p>
            )}

            {book.average_rating !== null && (
              <div
                className="mt-4 flex items-center"
                aria-label="Avaliação dos leitores"
              >
                <StarRating rating={book.average_rating} />
                <span className="text-lg font-semibold">
                  {Number(book.average_rating).toFixed(1)}
                </span>
                {book.ratings_count !== null && (
                  <span className="ml-2 text-muted-foreground">
                    ({Number(book.ratings_count).toLocaleString('pt-BR')}{' '}
                    avaliações)
                  </span>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
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
                ISBN: {book.isbn13 || book.isbn || 'Nenhum'}
              </span>
            </div>

            <div className="mt-6">
              <ReadingAction
                bookId={book.id}
                initial={{
                  readyToRead: book.ready_to_read,
                  hasFile: book.has_file,
                  canPrepare: book.source === 'calibre' && book.owned,
                }}
                tamanhoMaximo={TAMANHO_MAXIMO_ARQUIVO}
              />
            </div>

            <div className="mt-6">
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
            </div>

            <div className="mt-4">
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
            </div>

            <div className="mt-6">
              <BookCollections
                bookId={book.id}
                atuais={book.collections}
                todas={bibliotecas.map((b) => ({ id: b.id, name: b.name }))}
              />
            </div>
          </div>
        </div>

        {book.description && (
          <div className="mt-8 max-w-3xl">
            {/* A descrição do Calibre é HTML. Sanitizada no servidor
                (lib/description.ts) porque veio de metadados de terceiros. */}
            <div
              className="space-y-3 text-foreground/80 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc"
              dangerouslySetInnerHTML={{
                __html: sanitizeDescription(book.description),
              }}
            />
          </div>
        )}

        <div className="mt-10 space-y-8">
          <NotesSection bookId={book.id} initial={notas} />
          <BookmarksSection bookId={book.id} initial={marcadores} />
        </div>
      </div>
    </ScrollArea>
  );
}

function StarRating({ rating }: { rating: string | null }) {
  if (rating === null) return null;

  return (
    <div className="mr-4 flex items-center" aria-hidden>
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
