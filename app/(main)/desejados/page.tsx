import { fetchWishlist } from '@/lib/db/queries';
import { fetchNoteComments } from '@/lib/db/notes';
import { getCurrentUserId } from '@/lib/auth-user';
import { PageHeader } from '@/components/page-header';
import { WishlistClient } from './wishlist-client';

export default async function DesejadosPage() {
  const userId = await getCurrentUserId();
  const livros = await fetchWishlist(userId);
  const comentarios = await fetchNoteComments(userId, livros.map((l) => l.id));

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        titulo="Quero ter"
        descricao="Livros que você ainda não tem, cadastrados à mão — não fazem parte do acervo importado do Calibre."
      />
      <WishlistClient
        initial={livros}
        initialComments={Object.fromEntries(comentarios)}
      />
    </div>
  );
}
