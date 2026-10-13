const ALIASES: Record<string, string> = {
  en: 'en', eng: 'en', pt: 'por', por: 'por', es: 'spa', spa: 'spa',
  it: 'ita', ita: 'ita', ar: 'ara', ara: 'ara', fr: 'fre', fra: 'fre', fre: 'fre',
  de: 'ger', deu: 'ger', ger: 'ger', id: 'ind', ind: 'ind',
};

/** Mantém os códigos já usados pelo catálogo e aceita ISO 639 de outras línguas. */
export function normalizeLanguage(value: string | null | undefined): string | null {
  const code = value?.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  if (!/^[a-z]{2,3}$/.test(code)) return null;
  return ALIASES[code] ?? code;
}
