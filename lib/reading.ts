// lib/reading.ts
//
// Conversões entre página e percentual. O percentual é a fonte da verdade
// (AD-3): o dono lê com fonte ampliada, e a página do e-reader dele não
// corresponde à do metadado. Estas funções servem à entrada e à exibição,
// nunca ao armazenamento.

export const DIAS_PARA_PARADO = 14;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export function paginaDoPercentual(
  percent: number | null,
  numPages: number | null
): number | null {
  if (percent === null || numPages === null || numPages <= 0) return null;
  return Math.round((percent / 100) * numPages);
}

export function percentualDaPagina(
  pagina: number,
  numPages: number | null
): number | null {
  if (numPages === null || numPages <= 0) return null;
  if (pagina < 0) return null;
  // Página além do total significa que a base não bate — o leitor repaginou
  // por causa da fonte ampliada. Clampar para 100% gravaria "terminei" para
  // quem está na metade; devolver null deixa a interface avisar e o dono
  // usar o percentual, que é a fonte da verdade (AD-3).
  if (pagina > numPages) return null;
  return Math.round((pagina / numPages) * 100);
}

export function diasParado(
  atualizadoEm: Date | string | null,
  agora: Date = new Date()
): number | null {
  if (atualizadoEm === null) return null;
  const quando = atualizadoEm instanceof Date ? atualizadoEm : new Date(atualizadoEm);
  if (Number.isNaN(quando.getTime())) return null;
  return Math.floor((agora.getTime() - quando.getTime()) / MS_POR_DIA);
}
