'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { listarLivros } from '@/lib/offline/books';

interface OfflineContextValue {
  ids: Set<number>;
  atualizar: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue>({
  ids: new Set(),
  atualizar: async () => {},
});

/**
 * Carrega uma vez por navegação o conjunto de livros baixados (IndexedDB) e
 * o compartilha. Assim as capas não abrem uma transação de IDB cada uma, e
 * baixar/remover no leitor atualiza os selos da estante sem recarregar.
 */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<number>>(new Set());

  const atualizar = useCallback(async () => {
    try {
      const livros = await listarLivros();
      setIds(new Set(livros.map((l) => l.bookId)));
    } catch {
      // IndexedDB indisponível (ex.: modo privado): segue sem selos.
    }
  }, []);

  useEffect(() => {
    void atualizar();
  }, [atualizar]);

  return (
    <OfflineContext.Provider value={{ ids, atualizar }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
