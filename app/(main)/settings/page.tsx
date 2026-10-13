'use client';

import { useEffect, useState } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/page-header';

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
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader titulo="Configurações" />

      <section className="rounded-xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-border">
        <h2 className="mb-4 text-lg font-semibold">Conta</h2>
        <p className="text-muted-foreground">
          Conectado como <strong className="text-foreground">{email}</strong>
        </p>
      </section>
    </div>
  );
}
