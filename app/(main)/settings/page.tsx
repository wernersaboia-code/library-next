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
      <h1 className="font-display text-2xl font-semibold tracking-tight">Configurações</h1>

      <section className="rounded-xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-border">
        <h2 className="text-lg font-semibold mb-4">Conta</h2>
        <p className="text-muted-foreground">
          Conectado como <strong className="text-foreground">{email}</strong>
        </p>
      </section>
    </div>
  );
}
