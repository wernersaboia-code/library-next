export function BookCaption({
  titulo,
  autores,
}: {
  titulo: string;
  autores?: string[];
}) {
  return (
    <div className="mt-1.5 leading-tight">
      <p className="line-clamp-2 text-xs font-medium text-foreground">{titulo}</p>
      {autores && autores.length > 0 && (
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {autores.join(', ')}
        </p>
      )}
    </div>
  );
}
