'use client';

import { useEffect, useState } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SettingsPage() {
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setEmail(data.user.email);
        setStatus('authenticated');
      } else {
        setStatus('unauthenticated');
      }
    });
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') redirect('/login');
  }, [status]);

  if (status === 'loading') return <div className="p-8">Carregando...</div>;
  if (status !== 'authenticated') return null;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Conta</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Conectado como <strong>{email}</strong>
        </p>
      </section>
    </div>
  );
}
