import {
  BookOpenIcon,
  BookmarkIcon,
  LibraryIcon,
  BookXIcon,
} from 'lucide-react';
import type { ReadingStats } from '@/lib/db/queries';
import { ReadingHistory } from './reading-history';
import { ReadingYearBars } from './reading-year-bars';

export default function Dashboard({ stats }: { stats: ReadingStats }) {
  const cards = [
    {
      label: 'Livros no acervo',
      value: stats.totalBooks,
      icon: LibraryIcon,
      color: 'text-primary bg-primary/10',
      description: null,
    },
    {
      label: 'Lendo agora',
      value: stats.lendo,
      icon: BookOpenIcon,
      color: 'text-amber-600 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-500/15',
      description: null,
    },
    {
      label: 'Livros concluídos',
      value: stats.lidos,
      icon: BookmarkIcon,
      color: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-500/15',
      description: null,
    },
    {
      label: 'Abandonados',
      value: stats.abandonados,
      icon: BookXIcon,
      color: 'text-muted-foreground bg-muted',
      description: null,
    },
    {
      label: 'Páginas lidas',
      value: stats.paginasLidas,
      icon: BookOpenIcon,
      color: 'text-primary bg-primary/10',
      description: 'Somadas dos livros concluídos',
    },
  ];

  const anos = Object.entries(stats.porAno ?? {}).sort(
    ([a], [b]) => Number(b) - Number(a)
  );
  const periodos = [
    { label: 'Este mês', ...stats.mes },
    { label: 'Este ano', ...stats.ano },
  ];

  return (
    <section aria-label="Resumo do acervo e das leituras" className="mb-6">
      <dl className="hidden gap-3 md:grid md:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="flex min-w-0 flex-col rounded-xl bg-card p-3 text-card-foreground ring-1 ring-border"
          >
            <dt className="order-2 mt-1 text-xs font-medium">{card.label}</dt>
            <dd className="order-1 flex items-center justify-between gap-2">
              <span className="text-xl font-bold tabular-nums">
                {card.value.toLocaleString('pt-BR')}
              </span>
              <span className={`shrink-0 rounded-md p-1.5 ${card.color}`}>
                <card.icon className="h-4 w-4" aria-hidden />
              </span>
            </dd>
            {card.description && (
              <dd className="order-3 mt-1 text-[11px] leading-4 text-muted-foreground">
                {card.description}
              </dd>
            )}
          </div>
        ))}
      </dl>

      <div className={`grid grid-cols-1 gap-3 md:mt-3 ${anos.length > 0 ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]' : ''}`}>
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${anos.length > 0 ? 'lg:grid-cols-1' : ''}`}>
          {periodos.map((periodo) => (
            <div key={periodo.label} className="flex flex-col justify-center rounded-xl bg-card p-3.5 text-card-foreground ring-1 ring-border">
              <h3 className="text-xs font-semibold text-muted-foreground">{periodo.label}</h3>
              <p className="mt-1 text-sm">
                <span className="text-xl font-bold tabular-nums">{periodo.livros.toLocaleString('pt-BR')}</span>{' '}
                {periodo.livros === 1 ? 'livro concluído' : 'livros concluídos'}
              </p>
              <p className="text-xs text-muted-foreground">
                {periodo.paginas.toLocaleString('pt-BR')} páginas lidas
              </p>
            </div>
          ))}
        </div>

        {anos.length > 0 && (
          <div className="min-w-0 rounded-xl bg-card p-3.5 text-card-foreground ring-1 ring-border lg:h-[196px]">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div>
                <h3 className="text-sm font-semibold">Livros concluídos por ano</h3>
                <p className="text-[11px] text-muted-foreground">Pela data de conclusão</p>
              </div>
              {anos.length > 5 && <ReadingHistory anos={anos} />}
            </div>
            <ReadingYearBars anos={anos.slice(0, 5)} />
          </div>
        )}
      </div>

      {stats.lidosSemData > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {stats.lidosSemData.toLocaleString('pt-BR')}{' '}
          {stats.lidosSemData === 1
            ? 'livro concluído sem data registrada'
            : 'livros concluídos sem data registrada'}
          {' '}— fora das contagens por período.
        </p>
      )}
    </section>
  );
}
