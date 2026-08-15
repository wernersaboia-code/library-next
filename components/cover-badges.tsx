import { BookmarkIcon, HeartIcon } from 'lucide-react';
import { Estrelas } from './estrelas';

const STATUS_LABEL: Record<string, { texto: string; classe: string }> = {
  lido: { texto: 'Lido', classe: 'bg-emerald-600' },
  lendo: { texto: 'Lendo', classe: 'bg-amber-500' },
  abandonado: { texto: 'Abandonado', classe: 'bg-gray-600' },
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
      <div className="absolute right-1 top-1 flex items-center gap-1">
        {!owned && (
          <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
            Quero ter
          </span>
        )}
        {nextUp && (
          <span
            title="Na fila de leitura"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 shadow"
          >
            <BookmarkIcon aria-hidden className="h-3 w-3 fill-white text-white" />
            <span className="sr-only">Na fila de leitura</span>
          </span>
        )}
        {favorite && (
          <span
            title="Favorito"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 shadow"
          >
            <HeartIcon aria-hidden className="h-3 w-3 fill-white text-white" />
            <span className="sr-only">Favorito</span>
          </span>
        )}
      </div>

      {status && (
        <span
          className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow ${status.classe}`}
        >
          {status.texto}
        </span>
      )}

      {nota !== null && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/60 py-1">
          <Estrelas nota={nota} tamanho="sm" />
        </div>
      )}
    </>
  );
}
