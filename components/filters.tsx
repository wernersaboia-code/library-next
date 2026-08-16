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
  applyFilter,
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
  { value: 'abandonado', label: '🚫 Abandonado' },
];

const SERIES_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'sim', label: 'Faz parte de série' },
  { value: 'não', label: 'Livro avulso' },
];

const POSSE_OPTIONS = [
  { value: 'possuidos', label: 'Possuídos' },
  { value: 'nao-possuidos', label: 'Não possuídos' },
  { value: 'todos', label: 'Todos' },
];

export interface BibliotecaOption {
  id: number;
  name: string;
}

// O que conta como "filtro ativo" no selo/badge. `search` e `page` ficam de
// fora: um é busca e o outro é navegação, não filtro. `posse` só aparece na
// URL quando sai do default (possuidos), então presença já significa filtro.
const FILTER_KEYS: (keyof SearchParams)[] = [
  'yr', 'rtg', 'lng', 'pgs', 'status', 'series', 'bib', 'posse',
  'isbn', 'genre', 'pub',
];

export function contarFiltrosAtivos(searchParams: SearchParams): number {
  return FILTER_KEYS.filter((k) => searchParams[k] !== undefined).length;
}

function TituloSecao({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

interface FilterProps {
  searchParams: URLSearchParams;
}

function FilterBase({
  searchParams,
  bibliotecas = [],
}: FilterProps & { bibliotecas?: BibliotecaOption[] }) {
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
      const newFilters = applyFilter(optimisticFilters, filterType, value);
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

  // Posse tem default próprio ('possuidos', não 'todos'): omitir o parâmetro
  // da URL já produz o comportamento padrão (só possuídos) em buildFilters.
  const handlePosseChange = (value: string) => {
    handleFilterChange('posse', value === 'possuidos' ? undefined : value);
  };

  const ativos = contarFiltrosAtivos(optimisticFilters);
  const hasFilters = ativos > 0;

  return (
      <div
          data-pending={isPending ? '' : undefined}
          className="flex-shrink-0 flex h-full flex-col"
      >
        <ScrollArea className="flex-grow">
          <div className="space-y-6 px-4 py-4">

            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Filtros
                {ativos > 0 && (
                    <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">
                      ({ativos})
                    </span>
                )}
              </h2>
              {hasFilters && (
                  <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-2 py-1 text-xs text-muted-foreground"
                      onClick={handleClearFilters}
                  >
                    Limpar
                  </Button>
              )}
            </div>

            {/* Leitura */}
            <section className="space-y-4">
              <TituloSecao>Leitura</TituloSecao>

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
            </section>

            {/* Detalhes */}
            <section className="space-y-4">
              <TituloSecao>Detalhes</TituloSecao>

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
            </section>

            {/* Biblioteca */}
            <section className="space-y-4">
              <TituloSecao>Biblioteca</TituloSecao>

              {/* Posse */}
              <div>
                <Label htmlFor="posse">Posse</Label>
                <Select
                    value={optimisticFilters.posse ?? 'possuidos'}
                    onValueChange={handlePosseChange}
                >
                  <SelectTrigger id="posse" className="mt-2">
                    <SelectValue placeholder="Possuídos" />
                  </SelectTrigger>
                  <SelectContent>
                    {POSSE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Biblioteca */}
              {bibliotecas.length > 0 && (
                <div>
                  <Label htmlFor="biblioteca">Biblioteca</Label>
                  <Select
                      value={optimisticFilters.bib ?? 'todos'}
                      onValueChange={(value) => handleSelectChange('bib', value)}
                  >
                    <SelectTrigger id="biblioteca" className="mt-2">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      {bibliotecas.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name}
                          </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </section>

          </div>
        </ScrollArea>
      </div>
  );
}

export function FilterFallback() {
  return <FilterBase searchParams={new URLSearchParams()} />;
}

export function Filter({ bibliotecas }: { bibliotecas?: BibliotecaOption[] }) {
  const searchParams = useSearchParams();
  return <FilterBase searchParams={searchParams} bibliotecas={bibliotecas} />;
}
