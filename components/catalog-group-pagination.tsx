import Link from 'next/link';
import { Button } from './ui/button';

export function CatalogGroupPagination({ href, page, totalPages }: { href: string; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const link = (value: number) => {
    const url = new URL(href, 'https://catalog.invalid'); url.searchParams.set('page', String(value));
    return url.pathname + url.search;
  };
  return <nav aria-label="Páginas dos livros" className="flex items-center justify-between gap-3 border-t pt-4">
    {page > 1 ? <Button variant="outline" asChild><Link href={link(page - 1)}>Anterior</Link></Button> : <Button variant="outline" disabled>Anterior</Button>}
    <span className="text-center text-sm text-muted-foreground">Página {page.toLocaleString('pt-BR')} de {totalPages.toLocaleString('pt-BR')}</span>
    {page < totalPages ? <Button variant="outline" asChild><Link href={link(page + 1)}>Próxima</Link></Button> : <Button variant="outline" disabled>Próxima</Button>}
  </nav>;
}
