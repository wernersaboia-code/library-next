/**
 * Filtro e agrupamento da lista de desejados.
 *
 * Vive fora do componente de propósito: o repo não tem teste de componente,
 * então lógica dentro do .tsx ficaria sem cobertura. Aqui são funções puras,
 * testadas em test/desejados-agrupar.test.ts.
 */

/** O mínimo que estas funções exigem de um livro. */
export interface LivroFiltravel {
  title: string;
  original_title: string | null;
  authors: string[] | null;
}

/**
 * Caixa baixa e sem acento, para comparar texto digitado com texto gravado.
 * NFD separa a letra do acento; o intervalo BACKSLASH-u-0300 a BACKSLASH-u-036f
 * (escrito por extenso aqui de propósito) é o bloco Unicode das marcas
 * diacríticas assim separadas, que então descartamos no regex abaixo. Os
 * caracteres literais correspondentes são invisíveis e se corrompem ao
 * copiar — por isso o regex usa a forma escapada, nunca o caractere direto.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Livros cujo título, título original OU autor contém o termo. Termo vazio
 * devolve o próprio array recebido — sem cópia, porque o caso comum é não
 * haver filtro.
 */
export function filtrarLivros<T extends LivroFiltravel>(
  livros: T[],
  termo: string
): T[] {
  const alvo = normalizar(termo.trim());
  if (!alvo) return livros;

  return livros.filter((livro) => {
    const campos = [livro.title, livro.original_title, ...(livro.authors ?? [])];
    return campos.some((campo) => campo != null && normalizar(campo).includes(alvo));
  });
}

/**
 * A letra da divisória. Qualquer coisa que não seja A–Z depois de tirar o
 * acento (número, símbolo, título vazio) cai em '#'.
 */
export function letraInicial(title: string): string {
  const primeira = normalizar(title).trim().charAt(0).toUpperCase();
  return primeira >= 'A' && primeira <= 'Z' ? primeira : '#';
}

/**
 * Quebra a lista em seções por letra inicial.
 *
 * **Preserva a ordem recebida.** A ordenação é do Postgres (ver `fetchWishlist`);
 * reordenar aqui criaria uma segunda ordem que poderia divergir da primeira.
 * Por isso a seção '#' aparece onde o banco a põe — no começo, já que números
 * ordenam antes de letras.
 */
export function agruparPorLetra<T extends LivroFiltravel>(
  livros: T[]
): { letra: string; livros: T[] }[] {
  const secoes: { letra: string; livros: T[] }[] = [];

  for (const livro of livros) {
    const letra = letraInicial(livro.title);
    const ultima = secoes[secoes.length - 1];
    if (ultima && ultima.letra === letra) ultima.livros.push(livro);
    else secoes.push({ letra, livros: [livro] });
  }

  return secoes;
}
