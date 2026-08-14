import Link from 'next/link';
import { Photo } from './photo';
import { diasParado, DIAS_PARA_PARADO } from '@/lib/reading';
import type { ReadingNowBook } from '@/lib/db/queries';

export function ReadingStrip({ livros }: { livros: ReadingNowBook[] }) {
  // Faixa vazia não é renderizada (AD-5): um espaço fixo dizendo "nenhum
  // livro em leitura" é ruído permanente para o que a ausência já diz.
  if (livros.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
        Lendo agora
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {livros.map((livro) => {
          const dias = diasParado(livro.progress_updated_at);
          const parado = dias !== null && dias >= DIAS_PARA_PARADO;
          const percentual = livro.progress_percent ?? 0;

          return (
            <Link
              key={livro.id}
              href={`/${livro.id}`}
              className="w-24 shrink-0 transition ease-in-out md:hover:scale-105"
            >
              <Photo
                src={livro.image_url}
                title={livro.title}
                thumbhash={livro.thumbhash}
                priority={false}
                readStatus="lendo"
                myRating={null}
              />
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${percentual}%` }}
                />
              </div>
              <p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-400">
                {percentual}%
              </p>
              {parado && (
                <p className="text-[10px] text-amber-600">Parado há {dias}d</p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
