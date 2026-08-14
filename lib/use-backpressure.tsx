import { useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Manage backpressure for search input updates in the Next.js App Router.
 *
 * 1. When a new search is triggered, it immediately updates the URL.
 * 2. It keeps track of the last URL that was updated and the number of updates.
 * 3. It adds a delay (default 300ms, customizable) before allowing more updates.
 * 4. If an update occurs during this delay, it triggers another form submission.
 *
 * This prevents a janky UX when the user types quickly: em vez de navegar a cada
 * tecla, só a última busca da janela de `delay` vale.
 *
 * Nota: houve aqui um sinalizador `shouldSuspend` que o componente de busca usava
 * com `use(Promise.resolve())` para segurar a renderização. Isso quebrou no React 19
 * ("A component was suspended by an uncached promise") — e nunca chegou a funcionar,
 * porque uma promise já resolvida não suspende nada. O debounce abaixo é o que de
 * fato evita o piscar de resultados.
 *
 * Transitions allow you to update state without blocking the UI. When the form is
 * submitted from an Action, this will automatically trigger a React Transition.
 * Searching remains responsive and the UI remains interactive while the search results
 * are being queried. Further, we can observe the `pending` state of a transition and
 * show a loading spinner or skeleton UI.
 */
export function useBackpressure(delay: number = 300) {
  const router = useRouter();
  const isUpdatingRef = useRef(false);
  const updateCountRef = useRef(0);
  const latestUrlRef = useRef('');
  const formRef = useRef<HTMLFormElement>(null);

  async function triggerUpdate(newUrl: string) {
    updateCountRef.current++;
    latestUrlRef.current = newUrl;

    if (!isUpdatingRef.current) {
      isUpdatingRef.current = true;
      const currentUpdateCount = updateCountRef.current;

      router.replace(newUrl);

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          isUpdatingRef.current = false;
          if (updateCountRef.current !== currentUpdateCount) {
            formRef.current?.requestSubmit();
          }
          resolve();
        }, delay);
      });
    }
  }

  return { triggerUpdate, formRef };
}
