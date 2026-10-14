/** Navegação nativa no laboratório isolado; nenhuma API ou conta real é usada. */
export function useRouter() {
  return { push: (href: string) => window.location.assign(href), refresh: () => {}, prefetch: () => {} };
}
