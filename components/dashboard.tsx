import {
  BookOpenIcon,
  BookmarkIcon,
  LibraryIcon,
  BookXIcon,
} from 'lucide-react';
import type { ReadingStats } from '@/lib/db/queries';

export default function Dashboard({ stats }: { stats: ReadingStats }) {
  const cards = [
    {
      label: 'Total',
      value: stats.totalBooks,
      icon: LibraryIcon,
      color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30',
    },
    {
      label: 'Lendo',
      value: stats.lendo,
      icon: BookOpenIcon,
      color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
    },
    {
      label: 'Lidos',
      value: stats.lidos,
      icon: BookmarkIcon,
      color: 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30',
    },
    {
      label: 'Abandonados',
      value: stats.abandonados,
      icon: BookXIcon,
      color: 'text-gray-600 bg-gray-200 dark:text-gray-300 dark:bg-gray-700',
    },
    {
      label: 'Páginas',
      value: stats.paginasLidas,
      icon: BookOpenIcon,
      color: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30',
    },
  ];

  const anos = Object.entries(stats.porAno ?? {}).sort(
    ([a], [b]) => Number(a) - Number(b)
  );
  const maxAno = Math.max(...anos.map(([, quantidade]) => quantidade), 1);

  return (
    <div className="mb-6">
      <div className="flex gap-4 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 lg:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="flex min-w-[104px] shrink-0 flex-col items-center rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border md:min-w-0"
          >
            <div className={`p-2 rounded-full mb-2 ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <span className="text-2xl font-bold">{card.value}</span>
            <span className="text-xs text-muted-foreground">
              {card.label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border">
          <h3 className="text-xs font-semibold text-muted-foreground">
            Neste mês
          </h3>
          <p className="text-sm">
            <span className="text-xl font-bold">{stats.mes.livros}</span>{' '}
            {stats.mes.livros === 1 ? 'livro' : 'livros'} ·{' '}
            {stats.mes.paginas.toLocaleString('pt-BR')} páginas
          </p>
        </div>
        <div className="rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border">
          <h3 className="text-xs font-semibold text-muted-foreground">
            Neste ano
          </h3>
          <p className="text-sm">
            <span className="text-xl font-bold">{stats.ano.livros}</span>{' '}
            {stats.ano.livros === 1 ? 'livro' : 'livros'} ·{' '}
            {stats.ano.paginas.toLocaleString('pt-BR')} páginas
          </p>
        </div>
      </div>

      {anos.length > 0 && (
        <div className="mt-4 rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border">
          <h3 className="text-xs font-semibold text-muted-foreground mb-3">
            Lidos por ano
          </h3>
          {/* Barras horizontais, uma por ano: com colunas verticais muitos
              anos viravam um retângulo marrom sem informação. */}
          <div className="space-y-2">
            {anos.map(([ano, quantidade]) => (
              <div key={ano} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {ano}
                </span>
                <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${(quantidade / maxAno) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-xs font-medium tabular-nums text-foreground">
                  {quantidade}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.lidosSemData > 0 && (
        // AD-2: sem esta linha, "Lidos: 4" ao lado de um gráfico por ano
        // vazio parece defeito, quando é a consequência de não inventarmos
        // datas para leituras antigas.
        <p className="mt-2 text-xs text-muted-foreground">
          {stats.lidosSemData}{' '}
          {stats.lidosSemData === 1
            ? 'lido sem data registrada'
            : 'lidos sem data registrada'}
          {' '}— não entram na contagem por período.
        </p>
      )}
    </div>
  );
}
