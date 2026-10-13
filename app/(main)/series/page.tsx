import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { CatalogGroupIndex } from '@/components/catalog-group-index';
import { CatalogGroupBooks } from '@/components/catalog-group-books';
import { CatalogGroupPagination } from '@/components/catalog-group-pagination';
import { getCurrentUserId } from '@/lib/auth-user';
import { BROWSE_PAGE_SIZE, fetchCatalogGroupBooks, fetchCatalogSeries, fetchCatalogSeriesGroup } from '@/lib/db/catalog-browse';
import { seriesHref } from '@/lib/catalog-browse';
import { paginaValida } from '@/lib/url-state';

export default async function SeriesPage({ searchParams }: { searchParams: Promise<{ nome?: string | string[]; page?: string | string[] }> }) {
  const params = await searchParams;
  const userId = await getCurrentUserId();
  if (params.nome === undefined) {
    const groups = await fetchCatalogSeries(userId);
    return <div className="space-y-6"><PageHeader titulo="Séries" descricao="Explore as séries do seu catálogo e encontre os volumes em ordem." />
      <CatalogGroupIndex groups={groups} kind="series" /></div>;
  }
  if (typeof params.nome !== 'string' || !params.nome.trim()) notFound();
  const series = await fetchCatalogSeriesGroup(userId, params.nome);
  if (!series) notFound();
  const totalPages = Math.ceil(series.total / BROWSE_PAGE_SIZE);
  const page = paginaValida(params.page, totalPages);
  const books = await fetchCatalogGroupBooks(userId, { series: series.name }, page);
  const href = seriesHref(series.name);
  return <div className="space-y-6">
    <Button variant="ghost" size="sm" asChild className="-ml-2"><Link href="/series"><ArrowLeftIcon className="mr-2 h-4 w-4" />Séries</Link></Button>
    <PageHeader eyebrow="Série" titulo={series.name} descricao={`${series.total} ${series.total === 1 ? 'livro' : 'livros'} no seu catálogo · em ordem de volume; sem número ao final`} />
    <CatalogGroupBooks books={books} returnHref={`${href}&page=${page}`} showVolume />
    <CatalogGroupPagination href={href} page={page} totalPages={totalPages} />
  </div>;
}
