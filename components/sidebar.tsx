'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
  BookMarkedIcon,
  BookOpenIcon,
  BookmarkIcon,
  HardDriveDownloadIcon,
  HeartIcon,
  LayersIcon,
  LibraryIcon,
  LogOutIcon,
  SettingsIcon,
  ShoppingBagIcon,
  UploadIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { LINKS } from './nav-bar';
import { ThemeToggle } from './theme-toggle';
import { lerPayloadLivro, temPayloadLivro } from '@/lib/dnd';

export interface BibliotecaNavItem {
  id: number;
  name: string;
  total: number;
}

const ICONE_POR_HREF: Record<string, LucideIcon> = {
  '/': LibraryIcon,
  '/importar': UploadIcon,
  '/autores': UsersIcon,
  '/series': LayersIcon,
  '/leituras': BookOpenIcon,
  '/proximos': BookmarkIcon,
  '/favoritos': HeartIcon,
  '/desejados': ShoppingBagIcon,
  '/baixados': HardDriveDownloadIcon,
};

const ITENS_BIBLIOTECA = LINKS.filter((link) => link.href in ICONE_POR_HREF);
const ITEM_CONFIGURACOES = LINKS.find((link) => link.href === '/settings');

function ItemNav({
  href,
  label,
  icone: Icone,
  ativo,
  contagem,
  destacado,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  href: string;
  label: string;
  icone?: LucideIcon;
  ativo: boolean;
  contagem?: number;
  destacado?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
        ativo
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        destacado && 'bg-primary/10 font-medium text-foreground ring-2 ring-primary'
      )}
    >
      {Icone && <Icone className="h-4 w-4 shrink-0" aria-hidden />}
      <span className="truncate">{label}</span>
      {contagem !== undefined && (
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {contagem}
        </span>
      )}
    </Link>
  );
}

function Secao({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

export default function Sidebar({
  bibliotecas,
  email,
  className,
}: {
  bibliotecas: BibliotecaNavItem[];
  email: string;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sobreId, setSobreId] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function soltar(
    e: React.DragEvent,
    biblioteca: BibliotecaNavItem
  ) {
    e.preventDefault();
    setSobreId(null);
    const payload = lerPayloadLivro(e.dataTransfer);
    if (!payload || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/collections/${biblioteca.id}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookIds: [payload.bookId] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? 'Não foi possível adicionar.');
        return;
      }
      const n = Number(data?.adicionados ?? 0);
      if (n === 0) {
        toast.info(`"${payload.title}" já estava em ${biblioteca.name}.`);
      } else {
        toast.success(`"${payload.title}" adicionado a ${biblioteca.name}.`);
        router.refresh();
      }
    } catch {
      toast.error('Falha de rede ao adicionar.');
    } finally {
      setEnviando(false);
    }
  }

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside className={cn('flex flex-col gap-4 py-4', className)}>
      <Link
        href="/"
        className="flex items-center gap-3 px-4 font-display text-2xl font-bold tracking-tight text-foreground"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <BookMarkedIcon className="h-4 w-4" aria-hidden />
        </span>
        <span className="truncate">Book Inventory</span>
      </Link>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2">
        <Secao label="Biblioteca">
          {ITENS_BIBLIOTECA.map((item) => (
            <ItemNav
              key={item.href}
              href={item.href}
              label={item.label}
              icone={ICONE_POR_HREF[item.href]}
              ativo={item.ativo(pathname)}
            />
          ))}
        </Secao>

        <Secao label="Bibliotecas">
          <ItemNav
            href="/bibliotecas"
            label="Todas as bibliotecas"
            icone={LayersIcon}
            ativo={pathname === '/bibliotecas'}
          />
          {bibliotecas.map((biblioteca) => (
            <ItemNav
              key={biblioteca.id}
              href={`/bibliotecas/${biblioteca.id}`}
              label={biblioteca.name}
              ativo={pathname === `/bibliotecas/${biblioteca.id}`}
              contagem={biblioteca.total}
              destacado={sobreId === biblioteca.id}
              onDragOver={(e) => {
                if (!temPayloadLivro(e.dataTransfer)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                setSobreId(biblioteca.id);
              }}
              onDragLeave={() =>
                setSobreId((atual) => (atual === biblioteca.id ? null : atual))
              }
              onDrop={(e) => void soltar(e, biblioteca)}
            />
          ))}
          {bibliotecas.length === 0 && (
            <p className="px-2.5 py-1 text-xs text-muted-foreground">
              Nenhuma biblioteca ainda
            </p>
          )}
        </Secao>
      </nav>

      <div className="flex flex-col gap-0.5 px-2">
        {ITEM_CONFIGURACOES && (
          <ItemNav
            href={ITEM_CONFIGURACOES.href}
            label={ITEM_CONFIGURACOES.label}
            icone={SettingsIcon}
            ativo={ITEM_CONFIGURACOES.ativo(pathname)}
          />
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 px-3 pt-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase text-secondary-foreground"
          aria-hidden
        >
          {email.charAt(0)}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
          title={email}
        >
          {email}
        </span>
        <ThemeToggle />
        <button
          type="button"
          onClick={sair}
          aria-label="Sair"
          title="Sair"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOutIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
