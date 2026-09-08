import { BookmarkIcon, HeartIcon } from 'lucide-react';
import { Estrelas } from './estrelas';

const STATUS_LABEL: Record<string, { texto: string; classe: string }> = {
  lido: { texto: 'Lido', classe: 'bg-emerald-600/90' },
  lendo: { texto: 'Lendo', classe: 'bg-amber-500/90' },
  abandonado: { texto: 'Abandonado', classe: 'bg-gray-600/90' },
};

export function CoverBadges({
  readStatus,
  myRating,
  owned = true,
  nextUp = false,
  favorite = false,
}: {
  readStatus: string | null;
  myRating: number | null;
  owned?: boolean;
  nextUp?: boolean;
  favorite?: boolean;
}) {
  const status = readStatus ? STATUS_LABEL[readStatus] : undefined;
  const nota = myRating === null ? null : Number(myRating);
  if (!status && nota === null && owned && !nextUp && !favorite) return null;

  return (
    <>
      {/* Numa biblioteca que mistura o que se tem e o que se quer, sem esta
          marca o dono olha a estante sem saber o que de fato possui (AD-3).

          Canto direito: as três marcas quase nunca coexistem — "Quero ter" é
          livro que não se tem, a marca de próximo some quando o livro vira
          lido, e favorito exige lido. Empilham em linha se coincidirem. */}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
        {!owned && (
          <span className="rounded-full bg-stone-800/85 px-2 py-1 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm">
            Quero ter
          </span>
        )}
        {nextUp && (
          <span
            title="Na fila de leitura"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/95 shadow-sm ring-1 ring-white/40 backdrop-blur-sm"
          >
            <BookmarkIcon aria-hidden className="h-3.5 w-3.5 fill-primary-foreground text-primary-foreground" />
            <span className="sr-only">Na fila de leitura</span>
          </span>
        )}
        {favorite && (
          <span
            title="Favorito"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600/95 shadow-sm ring-1 ring-white/40 backdrop-blur-sm"
          >
            <HeartIcon aria-hidden className="h-3.5 w-3.5 fill-white text-white" />
            <span className="sr-only">Favorito</span>
          </span>
        )}
      </div>

      {status && (
        <span
          className={`absolute left-1.5 top-1.5 rounded-full px-2 py-1 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm ${status.classe}`}
        >
          {status.texto}
        </span>
      )}

      {nota !== null && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/75 via-black/45 to-transparent px-2 pb-1.5 pt-4">
          <Estrelas nota={nota} tamanho="sm" />
        </div>
      )}
    </>
  );
}
