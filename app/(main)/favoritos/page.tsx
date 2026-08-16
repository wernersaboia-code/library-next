import { getCurrentUserId } from '@/lib/auth-user';
import { fetchFavorites } from '@/lib/db/queries';
import { Estante } from '@/components/estante';
import { HeartIcon } from 'lucide-react';

export default async function FavoritosPage() {
  const userId = await getCurrentUserId();
  const livros = await fetchFavorites(userId);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Favoritos</h1>
        <p className="text-sm text-muted-foreground">
          {livros.length} {livros.length === 1 ? 'livro' : 'livros'} que
          superaram as expectativas.
        </p>
      </div>

      <Estante
        livros={livros}
        icone={HeartIcon}
        vazio={'Nenhum favorito ainda. Abra um livro que você já leu e toque '
          + 'em "Marcar como favorito".'}
      />
    </div>
  );
}
