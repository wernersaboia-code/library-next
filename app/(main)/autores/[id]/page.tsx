import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { CatalogGroupBooks } from '@/components/catalog-group-books';
import { CatalogGroupPagination } from '@/components/catalog-group-pagination';
import { authorHref } from '@/lib/catalog-browse';
import { getCurrentUserId } from '@/lib/auth-user';
import { BROWSE_PAGE_SIZE, fetchCatalogAuthor, fetchCatalogGroupBooks } from '@/lib/db/catalog-browse';
import { paginaValida } from '@/lib/url-state';

export default async function AuthorPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const author = await fetchCatalogAuthor(userId, id);
  if (!author) notFound();
  const totalPages = Math.ceil(author.total / BROWSE_PAGE_SIZE);
  const page = paginaValida((await searchParams).page, totalPages);
  const books = await fetchCatalogGroupBooks(userId, { authorId: id }, page);
  const href = authorHref(id);
  return <div className="space-y-6">
    <Button variant="ghost" size="sm" asChild className="-ml-2"><Link href="/autores"><ArrowLeftIcon className="mr-2 h-4 w-4" />Autores</Link></Button>
    <PageHeader eyebrow="Autor" titulo={author.name} descricao={`${author.total} ${author.total === 1 ? 'livro' : 'livros'} no seu catálogo`} />
    <CatalogGroupBooks books={books} returnHref={`${href}?page=${page}`} />
    <CatalogGroupPagination href={href} page={page} totalPages={totalPages} />
  </div>;
}
