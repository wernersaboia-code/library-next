import { PageHeader } from '@/components/page-header';
import { CatalogGroupIndex } from '@/components/catalog-group-index';
import { getCurrentUserId } from '@/lib/auth-user';
import { fetchCatalogAuthors } from '@/lib/db/catalog-browse';

export default async function AuthorsPage() {
  const groups = await fetchCatalogAuthors(await getCurrentUserId());
  return <div className="space-y-6">
    <PageHeader titulo="Autores" descricao="Encontre os livros de cada autor no seu catálogo, incluindo os que você quer ter." />
    <CatalogGroupIndex groups={groups} kind="authors" />
  </div>;
}
