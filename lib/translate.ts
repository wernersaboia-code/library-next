// lib/translate.ts
// Tradução via Google Cloud Translation v2 (REST). A chave vive só no
// servidor (GOOGLE_TRANSLATE_API_KEY); o cliente nunca a recebe.

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
const MAX_TEXT = 5000;

export async function translateText(
  text: string,
  target = 'pt-BR'
): Promise<string> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new Error('GOOGLE_TRANSLATE_API_KEY não definida');

  if (text.length > MAX_TEXT) {
    throw new Error('Texto muito longo para traduzir.');
  }

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target, format: 'text' }),
  });

  if (!res.ok) {
    throw new Error(`Falha na tradução (${res.status})`);
  }

  const data = (await res.json()) as {
    data?: { translations?: { translatedText?: string }[] };
  };
  const translated = data.data?.translations?.[0]?.translatedText;
  if (!translated) throw new Error('Sem resultado de tradução');
  return translated;
}
