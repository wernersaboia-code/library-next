import { Filter, FilterFallback } from '@/components/filters';
import { MobileFilters } from '@/components/mobile-filters';
import { Search, SearchFallback } from '@/components/search';
import NavBar from '@/components/nav-bar';
import MobileTabBar from '@/components/mobile-tab-bar';
import { Suspense } from 'react';
import { fetchCollections } from '@/lib/db/collections';
import { getCurrentUserId } from '@/lib/auth-user';

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = await getCurrentUserId();
  const bibliotecas = await fetchCollections(userId);

  return (
    <div className="group flex w-full">
      <div className="hidden md:block w-[300px] h-screen sticky top-0 p-6">
        <div className="h-full rounded-xl bg-card text-card-foreground shadow-sm ring-1 ring-border overflow-hidden">
          <Suspense fallback={<FilterFallback />}>
            <Filter bibliotecas={bibliotecas} />
          </Suspense>
        </div>
      </div>
      {/* min-w-0: sem isso, um filho com overflow-x-auto (as tarjas de
          estatística no celular) empurra este item flex para o tamanho do
          seu próprio conteúdo em vez de cortar em overflow — a página
          inteira ficava mais larga que a tela, exigindo rolar para o lado
          para ver o resto, inclusive o botão "Mais" da barra fixa do rodapé. */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm">
          <div className="mx-8 pt-3">
            <Suspense fallback={null}>
              <NavBar />
            </Suspense>
          </div>
          <div className="mx-8 flex items-center gap-2 pb-4">
            <Suspense fallback={<SearchFallback />}>
              <Search />
            </Suspense>
            <Suspense fallback={null}>
              <MobileFilters bibliotecas={bibliotecas} />
            </Suspense>
          </div>
        </div>
        <div className="flex-1 flex flex-col p-4 pb-16 md:pb-4">{children}</div>
      </div>
      <Suspense fallback={null}>
        <MobileTabBar />
      </Suspense>
    </div>
  );
}
