import { getCurrentUserId } from '@/lib/auth-user';
import { fetchNextUp } from '@/lib/db/queries';
import { Estante } from '@/components/estante';

export default async function ProximosPage() {
  const userId = await getCurrentUserId();
  const livros = await fetchNextUp(userId);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Próximos</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {livros.length} {livros.length === 1 ? 'livro' : 'livros'} na fila —
          o que você decidiu ler antes dos outros.
        </p>
      </div>

      <Estante
        livros={livros}
        vazio={'Nenhum livro na fila. Abra um livro e toque em "Ler em '
          + 'seguida", ou use o modo de seleção no acervo para marcar vários.'}
      />
    </div>
  );
}
