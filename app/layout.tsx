import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Neuton, Titillium_Web } from 'next/font/google';
import { Toaster } from 'sonner';
import { SerwistProvider } from '@serwist/turbopack/react';
import { cn } from '@/lib/utils';

const TitilliumWeb = Titillium_Web({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-titillium',
  display: 'swap',
});

const NeutonFont = Neuton({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-neuton',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Book Inventory',
  description: 'Seu catálogo pessoal de livros.',
  applicationName: 'Book Inventory',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Book Inventory',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fafb' },
    { media: '(prefers-color-scheme: dark)', color: '#030712' },
  ],
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
          TitilliumWeb.variable,
          NeutonFont.variable
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
        <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
      </body>
    </html>
  );
}
