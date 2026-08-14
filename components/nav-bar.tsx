'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function NavBar() {
  const router = useRouter();

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <nav className="flex items-center justify-end gap-4 mb-2">
      {/* Primeiro item: sem ele não havia como voltar ao catálogo de dentro
          de /desejados nem de /settings. */}
      <Link
        href="/"
        className="mr-auto text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Acervo
      </Link>
      <Link
        href="/bibliotecas"
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Bibliotecas
      </Link>
      <Link
        href="/desejados"
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Quero ter
      </Link>
      <Link
        href="/settings"
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Configurações
      </Link>
      <button
        onClick={sair}
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Sair
      </button>
    </nav>
  );
}
