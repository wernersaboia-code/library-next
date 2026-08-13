'use client';

import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { redirect } from 'next/navigation';

export default function SettingsPage() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') redirect('/login');
  }, [status]);

  if (status === 'loading') return <div className="p-8">Carregando...</div>;
  if (!session) return null;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Conta</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Conectado como <strong>{session.user?.email}</strong>
        </p>
      </section>
    </div>
  );
}
