import { Filter, FilterFallback } from '@/components/filters';
import { Search, SearchFallback } from '@/components/search';
import NavBar from '@/components/nav-bar';
import { Suspense } from 'react';

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="group flex w-full">
      <div className="hidden md:block w-[300px] h-screen sticky top-0 p-8">
        <div className="h-full rounded-lg bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <div className="h-full overflow-y-auto p-4">
            <Suspense fallback={<FilterFallback />}>
              <Filter />
            </Suspense>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-h-screen">
        <div className="sticky top-0 z-10 bg-gray-100 dark:bg-black">
          <div className="mx-8 pt-2">
            <Suspense fallback={null}>
              <NavBar />
            </Suspense>
          </div>
          <div className="mx-8 pb-4">
            <Suspense fallback={<SearchFallback />}>
              <Search />
            </Suspense>
          </div>
        </div>
        <div className="flex-1 flex flex-col p-4">{children}</div>
      </div>
    </div>
  );
}
