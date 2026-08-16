import { fetchCollections } from '@/lib/db/collections';
import { getCurrentUserId } from '@/lib/auth-user';
import { BibliotecasClient } from './bibliotecas-client';

export default async function BibliotecasPage() {
  const userId = await getCurrentUserId();
  const colecoes = await fetchCollections(userId);

  return (
    <div className="max-w-2xl mx-auto w-full p-4 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Bibliotecas</h1>
        <p className="text-sm text-muted-foreground">
          Conjuntos de livros que você monta — por tema, por fila de leitura,
          pelo que fizer sentido.
        </p>
      </div>
      <BibliotecasClient initial={colecoes} />
    </div>
  );
}
