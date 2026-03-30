// components/filters.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  SearchParams,
  parseSearchParams,
  stringifySearchParams,
} from '@/lib/url-state';

const LANGUAGES = [
  { value: 'todos', label: 'Todos' },
  { value: 'por', label: 'Português' },
  { value: 'en', label: 'Inglês' },
  { value: 'spa', label: 'Espanhol' },
  { value: 'ita', label: 'Italiano' },
  { value: 'ara', label: 'Árabe' },
  { value: 'fre', label: 'Francês' },
  { value: 'ger', label: 'Alemão' },
];

const READ_STATUS_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'lido', label: '✅ Lido' },
  { value: 'lendo', label: '📖 Lendo' },
  { value: 'não lido', label: '🕐 Não lido' },
];

const SERIES_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'sim', label: 'Faz parte de série' },
  { value: 'não', label: 'Livro avulso' },
];

interface FilterProps {
  searchParams: URLSearchParams;
}

function FilterBase({ searchParams }: FilterProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialFilters = parseSearchParams(Object.fromEntries(searchParams));
  const [optimisticFilters, setOptimisticFilters] =
      useOptimistic<SearchParams>(initialFilters);

  const updateURL = (newFilters: SearchParams) => {
    const queryString = stringifySearchParams(newFilters);
    router.push(queryString ? `/?${queryString}` : '/');
  };

  const handleFilterChange = (
      filterType: keyof SearchParams,
      value: string | undefined
  ) => {
    startTransition(() => {
      const newFilters = { ...optimisticFilters, [filterType]: value };
      setOptimisticFilters(newFilters);
      updateURL(newFilters);
    });
  };

  const handleClearFilters = () => {
    startTransition(() => {
      setOptimisticFilters({});
      router.push('/');
    });
  };

  // Converte 'todos' para undefined (sem filtro)
  const handleSelectChange = (
      filterType: keyof SearchParams,
      value: string
  ) => {
    handleFilterChange(filterType, value === 'todos' ? undefined : value);
  };

  const hasFilters = Object.values(optimisticFilters).some(
      (v) => v !== undefined
  );

  return (
      <div
          data-pending={isPending ? '' : undefined}
          className="flex-shrink-0 flex flex-col h-full bg-white dark:bg-gray-800"
      >
        <ScrollArea className="flex-grow">
          <div className="p-2 space-y-5">

            {/* Ano de Publicação */}
            <div>
              <Label htmlFor="year-range">Ano de Publicação</Label>
              <Slider
                  id="year-range"
                  min={1950}
                  max={2030}
                  step={5}
                  value={[Number(optimisticFilters.yr) || 2030]}
                  onValueChange={([value]) =>
                      handleFilterChange('yr', value === 2030 ? undefined : value.toString())
                  }
                  className="mt-2"
              />
              <div className="flex justify-between mt-1 text-sm text-muted-foreground">
                <span>1950</span>
                <span>{optimisticFilters.yr ?? 'Todos'}</span>
                <span>2030</span>
              </div>
            </div>

            {/* Avaliação Mínima */}
            <div>
              <Label htmlFor="rating">Avaliação Mínima</Label>
              <Slider
                  id="rating"
                  min={0}
                  max={5}
                  step={0.5}
                  value={[Number(optimisticFilters.rtg) || 0]}
                  onValueChange={([value]) =>
                      handleFilterChange('rtg', value === 0 ? undefined : value.toString())
                  }
                  className="mt-2"
              />
              <div className="flex justify-between mt-1 text-sm text-muted-foreground">
                <span>0</span>
                <span>{optimisticFilters.rtg ?? 0} ★</span>
                <span>5</span>
              </div>
            </div>

            {/* Idioma */}
            <div>
              <Label htmlFor="language">Idioma</Label>
              <Select
                  value={optimisticFilters.lng ?? 'todos'}
                  onValueChange={(value) => handleSelectChange('lng', value)}
              >
                <SelectTrigger id="language" className="mt-2">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Número de Páginas */}
            <div>
              <Label htmlFor="page-range">Número de Páginas</Label>
              <Slider
                  id="page-range"
                  min={1}
                  max={2000}
                  step={50}
                  value={[Number(optimisticFilters.pgs) || 2000]}
                  onValueChange={([value]) =>
                      handleFilterChange('pgs', value === 2000 ? undefined : value.toString())
                  }
                  className="mt-2"
              />
              <div className="flex justify-between mt-1 text-sm text-muted-foreground">
                <span>1</span>
                <span>{optimisticFilters.pgs ?? 'Todos'}</span>
                <span>2000+</span>
              </div>
            </div>

            {/* Status de Leitura */}
            <div>
              <Label htmlFor="read-status">Status de Leitura</Label>
              <Select
                  value={optimisticFilters.status ?? 'todos'}
                  onValueChange={(value) => handleSelectChange('status', value)}
              >
                <SelectTrigger id="read-status" className="mt-2">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {READ_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Série */}
            <div>
              <Label htmlFor="series">Série</Label>
              <Select
                  value={optimisticFilters.series ?? 'todos'}
                  onValueChange={(value) => handleSelectChange('series', value)}
              >
                <SelectTrigger id="series" className="mt-2">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {SERIES_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>
        </ScrollArea>

        {hasFilters && (
            <div className="p-4 border-t">
              <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleClearFilters}
              >
                Limpar filtros
              </Button>
            </div>
        )}
      </div>
  );
}

export function FilterFallback() {
  return <FilterBase searchParams={new URLSearchParams()} />;
}

export function Filter() {
  const searchParams = useSearchParams();
  return <FilterBase searchParams={searchParams} />;
}