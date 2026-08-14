'use client';

/**
 * Boundary global do App Router: recebe QUALQUER erro não tratado, de qualquer
 * origem — banco fora do ar, variável de ambiente ausente, falha de rede.
 *
 * A versão anterior afirmava sempre "o banco não possui a tabela books" e
 * mandava rodar `db:migrate`. Um erro de DNS do Postgres em produção (o host
 * de conexão direta do Supabase é IPv6-only e não resolve na Vercel) aparecia
 * como problema de migration, mandando quem lê para o lado errado. Uma
 * mensagem de erro que inventa a causa custa mais caro que uma genérica.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-md p-6 mx-auto bg-white dark:bg-black border border-gray-200 rounded-lg shadow-md">
      <h2 className="mb-4 text-xl font-bold text-center text-gray-900 dark:text-gray-100">
        Algo deu errado
      </h2>
      <p className="mb-4 text-gray-700 dark:text-gray-300">
        Não foi possível carregar esta página. Tente de novo; se persistir, o
        código abaixo identifica o erro nos registros do servidor.
      </p>
      {error.digest && (
        <p className="mb-4 text-sm text-gray-500">
          Código:{' '}
          <code className="p-1 font-mono bg-gray-200 dark:bg-gray-800 rounded">
            {error.digest}
          </code>
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-md"
      >
        Tentar novamente
      </button>
    </div>
  );
}
