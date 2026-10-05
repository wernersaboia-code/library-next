// Regra do gesto de virar página (EPUB e PDF). Fica aqui, fora da tela, porque
// o que decide se o leitor funciona é o conjunto de exceções — e não o arrasto
// em si.
//
// O epubjs no modo paginado não traz gesto nenhum: o swipe dele só existe no
// modo de rolagem. Então o gesto é nosso, e precisa desistir quando arrastar o
// dedo significa outra coisa:
// - arrasto vertical: é rolagem (da página do PDF, ou do próprio texto);
// - arrasto lento: é seleção de texto, não virada (a seleção também é checada
//   direto, para o caso do arrasto rápido);
// - arrasto para a direita começando na borda esquerda: é o "voltar" do
//   navegador — e o mesmo gesto existe no app instalado. Virar página ali
//   seria perder a leitura;
// - página ampliada com a pinça: aí o arrasto horizontal é rolagem da página,
//   não virada.

export type PontoDoToque = { x: number; y: number; ms: number };
export type DirecaoDaVirada = 'proxima' | 'anterior' | null;

/** Distância horizontal mínima, em px, para valer como virada. */
export const GESTO_VIRADA_PX = 45;
/** Duração máxima, em ms: arrasto mais lento que isso é seleção ou rolagem. */
export const GESTO_VIRADA_MS = 700;
/** Faixa da borda esquerda, em px, onde o arrasto para a direita é o "voltar". */
export const GESTO_BORDA_ESQUERDA_PX = 28;

/**
 * Direção da virada a partir do começo e do fim do toque (leitura da esquerda
 * para a direita: dedo para a esquerda avança, para a direita volta).
 * `temSelecao` e `ampliado` vêm de quem chama — o DOM não entra aqui.
 */
export function direcaoDaVirada(
  inicio: PontoDoToque | null,
  fim: PontoDoToque,
  opcoes: { temSelecao?: boolean; ampliado?: boolean } = {}
): DirecaoDaVirada {
  if (!inicio) return null;
  if (opcoes.temSelecao || opcoes.ampliado) return null;
  if (fim.ms - inicio.ms > GESTO_VIRADA_MS) return null;

  const dx = fim.x - inicio.x;
  const dy = fim.y - inicio.y;

  // Curto demais, ou mais vertical que horizontal: não é virada.
  if (Math.abs(dx) < GESTO_VIRADA_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return null;

  // Para a direita a partir da borda esquerda é o gesto de voltar do navegador.
  if (dx > 0 && inicio.x < GESTO_BORDA_ESQUERDA_PX) return null;

  return dx < 0 ? 'proxima' : 'anterior';
}
