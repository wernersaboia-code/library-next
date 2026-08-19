import Link from 'next/link';
import { BookmarkIcon, BookXIcon } from 'lucide-react';
import { getCurrentUserId } from '@/lib/auth-user';
import { fetchAbandonados, fetchLidos } from '@/lib/db/queries';
import { Estante } from '@/components/estante';
import { cn } from '@/lib/utils';

const ABAS = [
  { id: 'lidos', label: 'Lidos' },
  { id: 'abandonados', label: 'Abandonados' },
] as const;

type Aba = (typeof ABAS)[number]['id'];

// A URL é editável à mão: um valor torto cai no default em vez de dar 404,
// mesmo princípio que `paginaValida` já usa para o número de página.
function abaValida(entrada: unknown): Aba {
  return entrada === 'abandonados' ? 'abandonados' : 'lidos';
}

export default async function LeiturasPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const aba = abaValida(searchParams.aba);
  const userId = await getCurrentUserId();

  // Só a lista da aba ativa é buscada: abas no cliente exigiriam trazer as
  // duas para mostrar uma.
  const livros =
    aba === 'abandonados'
      ? await fetchAbandonados(userId)
      : await fetchLidos(userId);

  const plural = livros.length === 1 ? 'livro' : 'livros';

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Leituras
        </h1>
        <p className="text-sm text-muted-foreground">
          {aba === 'abandonados'
            ? `${livros.length} ${plural} que você largou no meio.`
            : `${livros.length} ${plural} que você já terminou.`}
        </p>
      </div>

      {/* Mesmas classes de item ativo que a fileira do nav-bar usa, para não
          inventar um terceiro estilo de seleção no app. */}
      <nav className="flex gap-1.5" aria-label="Abas de leituras">
        {ABAS.map((item) => (
          <Link
            key={item.id}
            href={`/leituras?aba=${item.id}`}
            aria-current={aba === item.id ? 'page' : undefined}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
              aba === item.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <Estante
        livros={livros}
        icone={aba === 'abandonados' ? BookXIcon : BookmarkIcon}
        vazio={
          aba === 'abandonados'
            ? 'Nenhum livro abandonado — o que é uma boa notícia. Marcar um '
              + 'livro como "Abandonado" na página dele o traz para cá.'
            : 'Nenhum livro lido ainda. Marcar um livro como "Lido" na '
              + 'página dele o traz para cá.'
        }
      />
    </div>
  );
}
