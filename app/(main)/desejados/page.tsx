import { fetchWishlist } from '@/lib/db/queries';
import { getCurrentUserId } from '@/lib/auth-user';
import { WishlistClient } from './wishlist-client';

export default async function DesejadosPage() {
  const userId = await getCurrentUserId();
  const livros = await fetchWishlist(userId);

  return (
    <div className="max-w-2xl mx-auto w-full p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quero ter</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Livros que você ainda não tem, cadastrados à mão — não fazem parte
          do acervo importado do Calibre.
        </p>
      </div>
      <WishlistClient initial={livros} />
    </div>
  );
}
