import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-2xl font-semibold">Você está offline</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Não deu para alcançar o servidor. Os livros baixados para leitura
        offline continuam disponíveis.
      </p>
      <Link
        href="/baixados"
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Ver livros baixados
      </Link>
    </div>
  );
}
