import './globals.css';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { Fraunces } from 'next/font/google';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';

const FrauncesFont = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Book Inventory',
  description: 'Seu catálogo pessoal de livros.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={cn(
          'bg-background font-sans text-foreground antialiased',
          GeistSans.variable,
          FrauncesFont.variable
        )}
      >
        {/* Aplica o tema antes do primeiro paint: sem isso o escuro pisca
            branco ao recarregar. A escolha fica em localStorage; sem escolha,
            segue o sistema. O ThemeToggle lê/grava a mesma chave. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tema');var d=t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
        <Toaster closeButton />
        {children}
      </body>
    </html>
  );
}
