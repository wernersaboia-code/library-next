export function BookCaption({
  titulo,
  autores,
}: {
  titulo: string;
  autores?: string[];
}) {
  return (
    <div className="mt-2 leading-tight">
      <p className="line-clamp-2 text-center font-serif text-sm font-medium text-foreground">
        {titulo}
      </p>
      {autores && autores.length > 0 && (
        <p className="mt-0.5 line-clamp-1 text-center text-xs text-muted-foreground">
          {autores.join(', ')}
        </p>
      )}
    </div>
  );
}
