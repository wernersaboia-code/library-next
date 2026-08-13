'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-black">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md dark:bg-gray-800 space-y-4">
        <h1 className="text-center text-2xl font-bold">Book Inventory</h1>
        <input type="email" required placeholder="E-mail" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border p-2 dark:bg-gray-700" />
        <input type="password" required placeholder="Senha" value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full rounded border p-2 dark:bg-gray-700" />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button type="submit"
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700">
          Entrar
        </button>
      </form>
    </div>
  );
}
