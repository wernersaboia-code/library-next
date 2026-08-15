// lib/estrelas.ts
//
// Regras da nota em meia estrela, separadas do componente porque o
// tsconfig do Next usa `jsx: preserve` e o Vitest não transforma .tsx —
// mesma razão pela qual `lib/reading.ts` existe ao lado dos controles de
// progresso.

/**
 * O ciclo de um toque repetido na mesma estrela (AD-2): cheia → meia →
 * limpa. Tocar em outra estrela recomeça o ciclo naquela.
 *
 * A metade esquerda/direita do ícone foi rejeitada porque o alvo fica em
 * torno de 12px no celular, que é onde o dono usa o site.
 */
export function proximaNota(atual: number | null, estrela: number): number | null {
  if (atual === estrela) return estrela - 0.5;
  if (atual === estrela - 0.5) return null;
  return estrela;
}

/** Quanto da estrela `n` deve estar pintado: 0, 0,5 ou 1. */
export function preenchimento(nota: number | null, n: number): number {
  if (nota === null) return 0;
  if (nota >= n) return 1;
  if (nota >= n - 0.5) return 0.5;
  return 0;
}

/** A nota como o português escreve: 3,5 e não 3.5. */
export function formatarNota(nota: number): string {
  return String(nota).replace('.', ',');
}
