/** Normaliza ISBN-10/13 e verifica o dígito de controle. */
export function cleanIsbn(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/^(?:urn:)?isbn(?:-1[03])?:?\s*/i, '')
    .replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(digits)) {
    const sum = [...digits].reduce((total, digit, i) =>
      total + (digit === 'X' ? 10 : Number(digit)) * (10 - i), 0);
    return sum % 11 === 0 ? digits : null;
  }
  if (/^97[89]\d{10}$/.test(digits)) {
    const sum = [...digits].reduce((total, digit, i) =>
      total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0 ? digits : null;
  }
  return null;
}

/** Converte um ISBN-10 para ISBN-13 (ou devolve o próprio ISBN-13). */
export function toIsbn13(value: string | null | undefined): string | null {
  const isbn = cleanIsbn(value);
  if (!isbn) return null;
  if (isbn.length === 13) return isbn;

  const core = `978${isbn.slice(0, 9)}`;
  let soma = 0;
  for (let i = 0; i < 12; i++) {
    soma += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const digito = (10 - (soma % 10)) % 10;
  return `${core}${digito}`;
}

/** ISBNs com prefixo 979 não possuem equivalente de dez dígitos. */
export function toIsbn10(value: string | null | undefined): string | null {
  const isbn = toIsbn13(value);
  if (!isbn?.startsWith('978')) return null;
  const core = isbn.slice(3, 12);
  const sum = [...core].reduce((total, digit, i) => total + Number(digit) * (10 - i), 0);
  const check = (11 - sum % 11) % 11;
  return core + (check === 10 ? 'X' : check);
}

/** Chave de comparação: minúsculas, sem acento e sem pontuação. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ano extraído de uma data em qualquer formato textual. */
export function yearOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  if (!match) return null;
  const ano = Number(match[1]);
  return ano >= 1000 && ano <= 2100 ? ano : null;
}

/** Primeiro nome de autor, normalizado — usado para casar registros. */
export function firstNameKey(authors: string[]): string {
  return authors.length > 0 ? normalizeText(authors[0]) : '';
}
