'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookMarkedIcon, LogOutIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';

const LINKS = [
  { href: '/', label: 'Acervo', ativo: (path: string) => path === '/' },
  {
    href: '/bibliotecas',
    label: 'Bibliotecas',
    ativo: (path: string) => path.startsWith('/bibliotecas'),
  },
  {
    href: '/proximos',
    label: 'Próximos',
    ativo: (path: string) => path.startsWith('/proximos'),
  },
  {
    href: '/favoritos',
    label: 'Favoritos',
    ativo: (path: string) => path.startsWith('/favoritos'),
  },
  {
    href: '/desejados',
    label: 'Quero ter',
    ativo: (path: string) => path.startsWith('/desejados'),
  },
  {
    href: '/settings',
    label: 'Configurações',
    ativo: (path: string) => path.startsWith('/settings'),
  },
];

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto py-2">
      <Link
        href="/"
        className="mr-auto flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <BookMarkedIcon className="h-4 w-4" aria-hidden />
        </span>
        <span className="hidden sm:inline">Book Inventory</span>
      </Link>
      {LINKS.map((link) => {
        const ativo = link.ativo(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
              ativo
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            {link.label}
          </Link>
        );
      })}
      <ThemeToggle />
      <button
        onClick={sair}
        className="ml-1 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOutIcon className="h-4 w-4" aria-hidden />
        Sair
      </button>
    </nav>
  );
}
