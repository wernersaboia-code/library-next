import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icone: Icon,
  titulo,
  descricao,
  acao,
  className,
}: {
  icone: React.ElementType;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center',
        className
      )}
    >
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="font-medium text-foreground">{titulo}</p>
      {descricao && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{descricao}</p>
      )}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}
