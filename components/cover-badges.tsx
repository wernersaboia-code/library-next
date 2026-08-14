import { StarIcon } from 'lucide-react';

const STATUS_LABEL: Record<string, { texto: string; classe: string }> = {
  lido: { texto: 'Lido', classe: 'bg-emerald-600' },
  lendo: { texto: 'Lendo', classe: 'bg-amber-500' },
};

export function CoverBadges({
  readStatus,
  myRating,
}: {
  readStatus: string | null;
  myRating: number | null;
}) {
  const status = readStatus ? STATUS_LABEL[readStatus] : undefined;
  const nota = myRating === null ? null : Number(myRating);
  if (!status && nota === null) return null;

  return (
    <>
      {status && (
        <span
          className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow ${status.classe}`}
        >
          {status.texto}
        </span>
      )}
      {nota !== null && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/60 py-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <StarIcon
              key={n}
              aria-hidden
              className={`h-3 w-3 ${n <= nota ? 'fill-yellow-400 text-yellow-400' : 'text-white/40'}`}
            />
          ))}
          <span className="sr-only">{`Sua avaliação: ${nota} de 5`}</span>
        </div>
      )}
    </>
  );
}
