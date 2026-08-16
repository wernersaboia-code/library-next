import { getCurrentUserId } from '@/lib/auth-user';
import { fetchNextUp } from '@/lib/db/queries';
import { Estante } from '@/components/estante';
import { BookmarkIcon } from 'lucide-react';

export default async function ProximosPage() {
  const userId = await getCurrentUserId();
  const livros = await fetchNextUp(userId);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Próximos</h1>
        <p className="text-sm text-muted-foreground">
          {livros.length} {livros.length === 1 ? 'livro' : 'livros'} na fila —
          o que você decidiu ler antes dos outros.
        </p>
      </div>

      <Estante
        livros={livros}
        icone={BookmarkIcon}
        vazio={'Nenhum livro na fila. Abra um livro e toque em "Ler em '
          + 'seguida", ou use o modo de seleção no acervo para marcar vários.'}
      />
    </div>
  );
}
