'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';

// Tempo de silêncio antes de buscar. Curto o bastante para parecer imediato,
// longo o bastante para uma palavra digitada inteira virar UMA navegação.
const DEBOUNCE_MS = 350;

/**
 * Campo de busca. A URL é a fonte da verdade; o campo é estado local que a
 * acompanha.
 *
 * Havia aqui um `<Form>` cujo `onChange` chamava `requestSubmit()` a cada
 * tecla, com um "backpressure" de 300ms que reenviava o formulário ao fim da
 * janela. Na prática cada letra virava uma navegação de servidor e a página
 * travava enquanto se digitava. O debounce abaixo faz o que aquele mecanismo
 * prometia, sem a rajada de submits.
 *
 * Duas correções vêm junto, ambas do mesmo `/?search=` fixo de antes:
 * os outros parâmetros (filtros, biblioteca) eram descartados a cada busca, e
 * buscar de dentro de Favoritos/Próximos jogava a pessoa no Acervo.
 */
export function Search() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryNaUrl = searchParams.get('search') ?? '';

  const [texto, setTexto] = useState(queryNaUrl);
  const [navegando, startTransition] = useTransition();
  // Sem isto, montar já com `?search=` na URL dispararia uma navegação
  // redundante para a página em que a pessoa já está.
  const ultimoEnviado = useRef(queryNaUrl);

  // A URL também muda por fora: voltar no histórico, tocar em "Acervo",
  // limpar um filtro. O campo precisa refletir isso em vez de manter o texto
  // de uma busca que não está mais valendo.
  useEffect(() => {
    setTexto(queryNaUrl);
    ultimoEnviado.current = queryNaUrl;
  }, [queryNaUrl]);

  function navegar(valor: string) {
    if (valor === ultimoEnviado.current) return;
    ultimoEnviado.current = valor;

    const params = new URLSearchParams(searchParams.toString());
    if (valor.trim()) params.set('search', valor);
    else params.delete('search');
    // Buscar recomeça da primeira página: manter o offset antigo devolvia
    // uma lista vazia quando a busca nova tem menos páginas que a atual.
    params.delete('page');

    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  useEffect(() => {
    if (texto === ultimoEnviado.current) return;
    const id = setTimeout(() => navegar(texto), DEBOUNCE_MS);
    return () => clearTimeout(id);
    // `navegar` é recriada a cada render; incluí-la reiniciaria o timer sem
    // parar, e o debounce nunca fecharia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Enter (e o botão "Buscar" do teclado no celular) não espera o
        // debounce; e tira o foco para o teclado sair da frente dos resultados.
        navegar(texto);
        (e.currentTarget.querySelector('input') as HTMLInputElement)?.blur();
      }}
      role="search"
      className="relative flex flex-1 flex-shrink-0 w-full rounded shadow-sm"
    >
      <label htmlFor="search" className="sr-only">
        Buscar
      </label>
      <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        onChange={(e) => setTexto(e.target.value)}
        // `search` (não `text`) dá ao teclado do celular a tecla de busca e o
        // "x" nativo para limpar.
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        name="search"
        id="search"
        placeholder="Buscar livros..."
        value={texto}
        className="w-full rounded-xl border-0 bg-card px-10 py-6 text-base shadow-sm ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring md:text-sm overflow-hidden"
      />
      <LoadingSpinner ativo={navegando} />
    </form>
  );
}

function LoadingSpinner({ ativo }: { ativo: boolean }) {
  return (
    <div
      data-pending={ativo ? '' : undefined}
      className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity duration-300"
    >
      <svg className="h-5 w-5" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeDasharray="282.7"
          strokeDashoffset="282.7"
          className={ativo ? 'animate-fill-clock' : ''}
          transform="rotate(-90 50 50)"
        />
      </svg>
    </div>
  );
}

// O fallback do Suspense enquanto `useSearchParams` resolve. Precisa ter a
// mesma marcação do campo real: um placeholder de forma diferente faz a
// barra "pular" quando o conteúdo real entra.
export function SearchFallback() {
  return (
    <div className="relative flex flex-1 flex-shrink-0 w-full rounded shadow-sm">
      <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        disabled
        placeholder="Buscar livros..."
        aria-label="Buscar"
        className="w-full rounded-xl border-0 bg-card px-10 py-6 text-base shadow-sm ring-1 ring-border md:text-sm overflow-hidden"
      />
    </div>
  );
}
