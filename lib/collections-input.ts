// lib/collections-input.ts
//
// Validação de entrada das rotas de biblioteca. Vive fora de `route.ts`
// porque arquivos de rota do App Router só podem exportar os handlers HTTP
// e alguns campos de configuração — exportar helpers dali quebra o build
// com "Route has an invalid export".

/** Violação do índice único de nome — o dono já tem uma biblioteca assim. */
export function ehNomeDuplicado(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err
    && (err as { code?: string }).code === '23505';
}

export const NOME_DUPLICADO = 'Já existe uma biblioteca com esse nome';
export const NOME_VAZIO = 'Dê um nome à biblioteca';

/** Nome aparado, ou null quando ausente/vazio. */
export function nomeValido(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}
