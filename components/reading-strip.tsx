import Link from 'next/link';
import { Photo } from './photo';
import { diasParado, DIAS_PARA_PARADO } from '@/lib/reading';
import type { ReadingNowBook } from '@/lib/db/queries';

export function ReadingStrip({ livros }: { livros: ReadingNowBook[] }) {
  // Faixa vazia não é renderizada (AD-5): um espaço fixo dizendo "nenhum
  // livro em leitura" é ruído permanente para o que a ausência já diz.
  if (livros.length === 0) return null;

  return (
    <section className="mb-8 border-b border-border/60 pb-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-2xl font-bold text-foreground">
          Lendo agora
        </h2>
        <span className="text-xs text-muted-foreground">Acompanhe seu ritmo</span>
      </div>
      <div className="no-scrollbar flex snap-x gap-5 overflow-x-auto pb-1">
        {livros.map((livro) => {
          const dias = diasParado(livro.progress_updated_at);
          const parado = dias !== null && dias >= DIAS_PARA_PARADO;
          const percentual = livro.progress_percent ?? 0;

          return (
            <Link
              key={livro.id}
              href={`/${livro.id}`}
              className="w-24 shrink-0 snap-start transition ease-in-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Photo
                bookId={livro.id}
                src={livro.image_url}
                title={livro.title}
                thumbhash={livro.thumbhash}
                priority={false}
                readStatus="lendo"
                myRating={null}
              />
              <p className="mt-1.5 truncate text-center font-serif text-xs font-medium text-foreground">
                {livro.title}
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${percentual}%` }}
                />
              </div>
              <p className="mt-1 text-center text-[11px] text-muted-foreground">
                {percentual}%
              </p>
              {parado && (
                <p className="text-center text-[10px] text-amber-600">
                  Parado há {dias}d
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
