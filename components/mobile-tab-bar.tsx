'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookmarkIcon,
  LayersIcon,
  LibraryIcon,
  ShoppingBagIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { HREFS_BARRA, LINKS } from './nav-bar';
import { MobileMoreMenu } from './mobile-more-menu';

const ICONES: Record<string, typeof LibraryIcon> = {
  '/': LibraryIcon,
  '/desejados': ShoppingBagIcon,
  '/proximos': BookmarkIcon,
  '/bibliotecas': LayersIcon,
};

export default function MobileTabBar() {
  const pathname = usePathname();
  const itens = LINKS.filter((link) => HREFS_BARRA.includes(link.href)).sort(
    (a, b) => HREFS_BARRA.indexOf(a.href) - HREFS_BARRA.indexOf(b.href)
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t bg-card md:hidden">
      {itens.map((item) => {
        const ativo = item.ativo(pathname);
        const Icone = ICONES[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5',
              ativo ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icone className="h-5 w-5" aria-hidden />
            <span className="text-[11px] font-medium">{item.label}</span>
          </Link>
        );
      })}
      <MobileMoreMenu />
    </nav>
  );
}
