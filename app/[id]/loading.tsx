import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <ScrollArea className="px-4 h-full">
      <div className="mx-auto max-w-6xl pb-8">
      <Button variant="ghost" className="mb-4" disabled>
        <ArrowLeftIcon className="mr-2 h-4 w-4" /> Voltar
      </Button>
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <Skeleton className="mx-auto aspect-[2/3] w-2/3 max-w-xs rounded-md md:mx-0 md:w-1/4" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
      </div>
    </ScrollArea>
  );
}
