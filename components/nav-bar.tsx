'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

export default function NavBar() {
  const { data: session } = useSession();

  if (!session) return null;

  return (
    <nav className="flex items-center justify-end gap-4 mb-2">
      <Link
        href="/settings"
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Configurações
      </Link>
      <button
        onClick={() => signOut()}
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Sair
      </button>
    </nav>
  );
}
