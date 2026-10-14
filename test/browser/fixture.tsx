import { createRoot } from 'react-dom/client';
import { BooksGrid } from '@/components/grid';
import { SavedSearches } from '@/components/saved-searches';
import { ExportReading } from '@/components/export-reading';
import { parseSearchParams, stringifySearchParams } from '@/lib/url-state';
import { rgbaToThumbHash } from 'thumbhash';

const params = parseSearchParams(Object.fromEntries(new URLSearchParams(location.search)));
const hash = rgbaToThumbHash(2, 3, new Uint8Array(Array.from({ length: 6 }, () => [3, 105, 161, 255]).flat()));
const thumbhash = btoa(String.fromCharCode(...hash));
const books = Array.from({ length: 28 }, (_, index) => ({
  id: index + 1, title: index % 3 ? `Livro ${index + 1}` : `Livro ${index + 1}: um título longo para testar a altura das legendas`, authors: ['Autora de teste'],
  image_url: index % 7 === 0 ? null : `/cover.svg?id=${index}`, thumbhash,
  read_status: index % 3 ? 'não lido' : 'lido',
  my_rating: index % 3 ? null : 4.5, owned: true, next_up: index % 5 === 0, favorite: index % 3 === 0,
}));

function Fixture() {
  if (/^\/\d+$/.test(location.pathname)) return <main><h1>Ficha do livro</h1><a href={`/?${stringifySearchParams(params)}`}>Voltar</a></main>;
  return <main className="mx-auto max-w-6xl p-4">
    <h1 className="mb-6 text-3xl">Acervo de teste</h1>
    <SavedSearches initial={[]} query={stringifySearchParams(params)} />
    <BooksGrid userId="browser-test" books={books} searchParams={params} bibliotecas={[]} />
    <ExportReading />
  </main>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Raiz do laboratório não encontrada');
createRoot(root).render(<Fixture />);
