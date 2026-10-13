import { Suspense } from 'react';
import Link from 'next/link';
import { BookMarkedIcon } from 'lucide-react';
import { MobileFilters } from '@/components/mobile-filters';
import { Search, SearchFallback } from '@/components/search';
import MobileTabBar from '@/components/mobile-tab-bar';
import Sidebar from '@/components/sidebar';
import { fetchCollections } from '@/lib/db/collections';
import { getCurrentUser } from '@/lib/auth-user';
import { OfflineProvider } from '@/components/offline-provider';

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const bibliotecas = await fetchCollections(user.id);

  return (
    <OfflineProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar
          className="sticky top-0 hidden h-screen w-64 shrink-0 md:flex"
          bibliotecas={bibliotecas}
          email={user.email}
        />

        <div className="flex min-w-0 flex-1 p-2 md:ps-0">
          <div className="flex min-h-[calc(100vh-1rem)] w-full flex-col rounded-lg border border-border bg-card text-card-foreground">
            <header className="sticky top-0 z-10 flex items-center gap-2 rounded-t-lg border-b border-border/60 bg-card/90 px-4 py-3 backdrop-blur-sm">
              <Link
                href="/"
                aria-label="Book Inventory"
                className="mr-1 flex shrink-0 items-center gap-2 md:hidden"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <BookMarkedIcon className="h-4 w-4" aria-hidden />
                </span>
              </Link>
              <Suspense fallback={<SearchFallback />}>
                <Search />
              </Suspense>
              <Suspense fallback={null}>
                <MobileFilters bibliotecas={bibliotecas} />
              </Suspense>
            </header>

            <main className="flex min-h-0 flex-1 flex-col p-4 pb-20 md:p-6 md:pb-6">
              {children}
            </main>
          </div>
        </div>

        <Suspense fallback={null}>
          <MobileTabBar />
        </Suspense>
      </div>
    </OfflineProvider>
  );
}
