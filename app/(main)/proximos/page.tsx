import { getCurrentUserId } from '@/lib/auth-user';
import { fetchNextUp } from '@/lib/db/queries';
import { Estante } from '@/components/estante';
import { PageHeader } from '@/components/page-header';
import { BookmarkIcon } from 'lucide-react';

export default async function ProximosPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const search = typeof searchParams.search === 'string' ? searchParams.search : undefined;
  const userId = await getCurrentUserId();
  const livros = await fetchNextUp(userId, search);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Próximos"
        descricao={`${livros.length} ${
          livros.length === 1 ? 'livro' : 'livros'
        } na fila — o que você decidiu ler antes dos outros.`}
      />

      <Estante
        livros={livros}
        icone={BookmarkIcon}
        vazio={'Nenhum livro na fila. Abra um livro e toque em "Ler em '
          + 'seguida", ou use o modo de seleção no acervo para marcar vários.'}
      />
    </div>
  );
}
