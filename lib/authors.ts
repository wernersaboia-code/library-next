/** Id determinístico e estável — a mesma grafia sempre gera o mesmo id. */
export function authorId(name: string): string {
  return (
    name.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      .slice(0, 50) || 'desconhecido'
  );
}
