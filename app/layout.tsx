import './globals.css';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';
import SessionProvider from '@/components/session-provider';

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
          'bg-gray-100 font-sans antialiased dark:bg-black dark:text-white',
          GeistSans.variable
        )}
      >
        <SessionProvider>
          <Toaster closeButton />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
