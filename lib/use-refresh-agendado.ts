'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Agenda um `router.refresh()` coalescido para a página do livro.
 *
 * Vários controles (status, avaliação, progresso, bibliotecas) revalidam ao
 * salvar. Cada salvo já atualiza o estado local otimisticamente, então
 * cliques em sequência virariam um refresh por clique — cada um re-renderando
 * a página no servidor. Aqui, mutações rápidas viram UMA revalidação no fim:
 * o refresh só re-sincroniza as partes renderizadas no servidor (selos da
 * capa, por exemplo), e o estado local já refletiu o resto.
 *
 * O timer é limpo no unmount: navegar para longe cancela o refresh pendente,
 * em vez de re-renderar a rota para onde o dono já foi.
 */
export function useRefreshAgendado(atrasoMs = 150) {
  const router = useRouter();
  const pendente = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agendar = useCallback(() => {
    if (pendente.current) return;
    pendente.current = setTimeout(() => {
      pendente.current = null;
      router.refresh();
    }, atrasoMs);
  }, [router, atrasoMs]);

  useEffect(() => {
    return () => {
      if (pendente.current) {
        clearTimeout(pendente.current);
        pendente.current = null;
      }
    };
  }, []);

  return agendar;
}
