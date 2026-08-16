'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';

/**
 * Alterna a classe `dark` no <html>. A escolha fica em localStorage; sem
 * escolha prévia, segue o sistema (prefers-color-scheme). O script inline no
 * layout raiz aplica o tema antes do primeiro paint para não piscar o tema
 * errado.
 */
export function ThemeToggle() {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    const salvo = localStorage.getItem('tema');
    const escuroInicial =
      salvo === 'dark' ||
      (salvo === null &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    setEscuro(escuroInicial);
    document.documentElement.classList.toggle('dark', escuroInicial);
  }, []);

  function alternar() {
    const proximo = !escuro;
    setEscuro(proximo);
    localStorage.setItem('tema', proximo ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', proximo);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
      title={escuro ? 'Tema claro' : 'Tema escuro'}
    >
      {escuro ? (
        <SunIcon className="h-4 w-4" aria-hidden />
      ) : (
        <MoonIcon className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
