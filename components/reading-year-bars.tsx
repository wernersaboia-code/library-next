export function ReadingYearBars({ anos }: { anos: [string, number][] }) {
  const maximo = Math.max(...anos.map(([, quantidade]) => quantidade), 1);

  return (
    <ul aria-label="Livros concluídos em cada ano" className="space-y-1.5">
      {anos.map(([ano, quantidade]) => (
        <li key={ano} className="flex items-center gap-3 text-xs tabular-nums">
          <span className="w-10 shrink-0 text-muted-foreground">{ano}</span>
          <div aria-hidden className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${(quantidade / maximo) * 100}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right font-medium">
            {quantidade.toLocaleString('pt-BR')} <span className="sr-only">{quantidade === 1 ? 'livro' : 'livros'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
