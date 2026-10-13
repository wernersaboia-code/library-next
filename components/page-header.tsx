export function PageHeader({
  eyebrow,
  titulo,
  descricao,
  acao,
}: {
  eyebrow?: string;
  titulo: string;
  descricao?: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
        )}
        <h1 className="font-serif text-3xl font-bold tracking-tight md:text-4xl">
          {titulo}
        </h1>
        {descricao && (
          <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
        )}
      </div>
      {acao}
    </header>
  );
}
