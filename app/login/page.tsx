'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookMarkedIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email, password: senha,
    });
    if (error) { setErro('E-mail ou senha inválidos.'); return; }
    // garante a linha app_users antes de qualquer query com FK
    const res = await fetch('/api/auth/ensure', { method: 'POST' });
    if (!res.ok) {
      setErro('Não foi possível inicializar sua conta. Tente novamente.');
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form
        onSubmit={entrar}
        className="w-full max-w-sm space-y-4 rounded-xl bg-card p-8 text-card-foreground shadow-md ring-1 ring-border"
      >
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <BookMarkedIcon className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="text-center font-display text-2xl font-semibold tracking-tight">
            Book Inventory
          </h1>
          <p className="text-center text-sm text-muted-foreground">
            Seu catálogo pessoal de livros.
          </p>
        </div>
        <input
          type="email"
          required
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-input bg-background p-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          type="password"
          required
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full rounded-lg border border-input bg-background p-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}
