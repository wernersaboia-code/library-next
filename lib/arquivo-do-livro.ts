// Regras do arquivo de livro escolhido no aparelho (EPUB/PDF). Ficam aqui, fora
// da tela e da rota, porque valem para os dois lados: o navegador recusa o
// arquivo errado antes de subir 20 MB de dados móveis, e a rota recusa de novo
// — o que vem do navegador nunca é confiável.

export type FormatoDoLivro = 'epub' | 'pdf';

/** Teto por arquivo. É o mesmo do comando local (`BOOK_FILE_MAX_BYTES`). */
export const TAMANHO_MAXIMO_PADRAO = 50 * 1024 * 1024;

const MIMES: Record<FormatoDoLivro, string> = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
};

/** Formato a partir do nome do arquivo, ou null quando não é EPUB nem PDF. */
export function formatoDoArquivo(nome: string): FormatoDoLivro | null {
  const ext = nome.toLowerCase().split('.').pop() ?? '';
  if (ext === 'epub') return 'epub';
  if (ext === 'pdf') return 'pdf';
  return null;
}

export function mimeDoFormato(formato: FormatoDoLivro): string {
  return MIMES[formato];
}

export type EscolhaValidada =
  | { ok: true; formato: FormatoDoLivro; mime: string }
  | { ok: false; erro: string };

/** Valida o arquivo escolhido antes de qualquer envio. */
export function validarArquivo(
  nome: string,
  tamanho: number,
  maximo: number = TAMANHO_MAXIMO_PADRAO
): EscolhaValidada {
  const formato = formatoDoArquivo(nome);
  if (!formato) {
    return { ok: false, erro: 'Escolha um arquivo EPUB ou PDF.' };
  }
  if (!Number.isFinite(tamanho) || tamanho <= 0) {
    return { ok: false, erro: 'Esse arquivo está vazio.' };
  }
  if (tamanho > maximo) {
    return {
      ok: false,
      erro: `Esse arquivo tem ${emMegabytes(tamanho)} e o limite é ${emMegabytes(maximo)}.`,
    };
  }
  return { ok: true, formato, mime: MIMES[formato] };
}

/** "12,4 MB" — para a tela e para as mensagens de erro. */
export function emMegabytes(bytes: number): string {
  const mb = (bytes / 1024 / 1024).toFixed(1).replace('.', ',');
  return `${mb} MB`;
}

/** O limite em MB, redondo, para o texto de ajuda da tela. */
export function limiteEmMegabytes(maximo: number = TAMANHO_MAXIMO_PADRAO): number {
  return Math.round(maximo / 1024 / 1024);
}
