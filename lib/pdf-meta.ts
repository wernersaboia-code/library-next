import 'server-only';

/**
 * Conta páginas sem carregar o pdfjs inteiro no servidor: o número de
 * objetos /Type /Page é confiável em PDFs bem formados e o custo é uma
 * varredura de bytes. Devolve null quando não é PDF ou não dá para contar.
 */
export async function pdfPageCount(buffer: ArrayBuffer): Promise<number | null> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 5) return null;

  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 5));
  if (header !== '%PDF-') return null;

  const text = new TextDecoder('latin1').decode(bytes);

  const countMatch = text.match(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/);
  if (countMatch) return Number(countMatch[1]);

  const pages = text.match(/\/Type\s*\/Page[^s]/g);
  return pages ? pages.length : null;
}
