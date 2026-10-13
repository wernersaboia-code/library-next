import { fetchCollections } from '@/lib/db/collections';
import { getCurrentUserId } from '@/lib/auth-user';
import { BibliotecasClient } from './bibliotecas-client';
import { PageHeader } from '@/components/page-header';

export default async function BibliotecasPage() {
  const userId = await getCurrentUserId();
  const colecoes = await fetchCollections(userId);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        titulo="Bibliotecas"
        descricao="Conjuntos de livros que você monta — por tema, por fila de leitura, pelo que fizer sentido."
      />
      <BibliotecasClient initial={colecoes} />
    </div>
  );
}
