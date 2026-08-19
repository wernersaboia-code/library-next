'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpenIcon,
  HeartIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  XIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { HREFS_BARRA, LINKS } from './nav-bar';
import { ThemeToggle } from './theme-toggle';

// Ícone por seção. `?? BookOpenIcon` não é decoração: o tsconfig não liga
// `noUncheckedIndexedAccess`, então uma chave ausente aqui tiparia como
// componente válido e só quebraria em execução, ao renderizar.
const ICONES_MAIS: Record<string, typeof BookOpenIcon> = {
  '/leituras': BookOpenIcon,
  '/favoritos': HeartIcon,
  '/settings': SettingsIcon,
};

// O complemento exato da barra fixa: toda seção de LINKS que não está lá
// aparece aqui. Antes esta lista era escrita à mão, e uma seção nova podia
// existir no desktop e sumir do celular sem erro de tipo nem de execução.
const ITENS_MAIS = LINKS.filter((link) => !HREFS_BARRA.includes(link.href));

/**
 * As seções que não cabem na barra fixa do celular (mobile-tab-bar.tsx),
 * derivadas de LINKS em vez de repetidas aqui — ver ITENS_MAIS abaixo —,
 * mais o alternador de tema e o Sair, que não são rotas. Mesmo padrão de
 * gatilho + painel que mobile-filters.tsx já usa, com o painel entrando
 * pela lateral (mesma estrutura, evita inventar um segundo padrão de
 * painel no app).
 */
export function MobileMoreMenu() {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', aoTecla);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', aoTecla);
    };
  }, [aberto]);

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground"
      >
        <MoreHorizontalIcon className="h-5 w-5" aria-hidden />
        <span className="text-[11px] font-medium">Mais</span>
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Mais opções"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setAberto(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col bg-card text-card-foreground shadow-xl ring-1 ring-border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Mais
              </h2>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Fechar"
              >
                <XIcon className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="flex flex-col gap-1 p-3">
              {ITENS_MAIS.map((item) => {
                const Icone = ICONES_MAIS[item.href] ?? BookOpenIcon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setAberto(false)}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    <Icone className="h-4 w-4" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
              <div className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-foreground">
                Tema
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={sair}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOutIcon className="h-4 w-4" aria-hidden />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
