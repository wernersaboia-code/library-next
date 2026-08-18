'use client';

import { StarIcon } from 'lucide-react';
import { proximaNota, preenchimento, formatarNota } from '@/lib/estrelas';

function rotulo(nota: number | null, estrela: number): string {
  const alvo = proximaNota(nota, estrela);
  if (alvo === null) return 'Tirar a avaliação';
  return `Avaliar com ${formatarNota(alvo)}`;
}

function Estrela({ parte, classe }: { parte: number; classe: string }) {
  if (parte === 0) {
    return <StarIcon aria-hidden className={`${classe} text-muted-foreground/40`} />;
  }
  if (parte === 1) {
    return <StarIcon aria-hidden className={`${classe} fill-yellow-400 text-yellow-400`} />;
  }
  // Meia: a estrela cheia por cima da vazia, recortada ao meio. `clip-path`
  // acompanha o tamanho do ícone, então serve tanto à capa quanto à página.
  return (
    <span className={`relative inline-block ${classe}`}>
      <StarIcon aria-hidden className={`${classe} absolute inset-0 text-muted-foreground/40`} />
      <StarIcon
        aria-hidden
        className={`${classe} absolute inset-0 fill-yellow-400 text-yellow-400`}
        style={{ clipPath: 'inset(0 50% 0 0)' }}
      />
    </span>
  );
}

export function Estrelas({
  nota,
  tamanho = 'md',
  onEscolher,
}: {
  nota: number | null;
  tamanho?: 'sm' | 'md';
  onEscolher?: (nota: number | null) => void;
}) {
  const classe = tamanho === 'sm' ? 'h-3 w-3' : 'h-7 w-7';

  if (!onEscolher) {
    return (
      <span className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Estrela key={n} parte={preenchimento(nota, n)} classe={classe} />
        ))}
        <span className="sr-only">
          {nota === null
            ? 'Sem avaliação'
            : `Sua avaliação: ${formatarNota(nota)} de 5`}
        </span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={rotulo(nota, n)}
          onClick={() => onEscolher(proximaNota(nota, n))}
          className="p-1"
        >
          <Estrela parte={preenchimento(nota, n)} classe={classe} />
        </button>
      ))}
      <span className="ml-2 text-sm text-muted-foreground">
        {nota === null ? 'sem nota' : formatarNota(nota)}
      </span>
    </div>
  );
}
