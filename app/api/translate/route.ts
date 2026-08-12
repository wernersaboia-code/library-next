import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';

const MAX_TEXT_LENGTH = 5000;

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { text, source, target } = await req.json();
  if (!text || !target)
    return NextResponse.json({ error: 'text e target obrigatórios' }, { status: 400 });

  // Limite de tamanho: hoje existia só no cliente. Trunca aqui também para
  // não deixar um cliente malicioso mandar textos enormes (custo real por
  // caractere na API do Google). Checado ANTES do rate limit: é uma
  // rejeição/normalização barata, sem custo de banco.
  const safeText: string = text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH)
    : text;

  const limit = Number(process.env.TRANSLATE_HOURLY_LIMIT ?? 200);
  const { allowed, remaining } = await checkRateLimit(userId, 'translate', limit);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Limite de traduções por hora atingido. Tente mais tarde.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: 'API key não configurada' }, { status: 501 });

  try {
    const params = new URLSearchParams({
      q: safeText,
      target,
      format: 'text',
    });
    if (source) params.set('source', source);

    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?${params}`,
      { headers: { 'X-Goog-Api-Key': apiKey } }
    );

    const data = await res.json();

    if (!res.ok)
      return NextResponse.json({ error: data.error?.message || 'Erro na tradução' }, { status: res.status });

    const translated = data.data?.translations?.[0]?.translatedText;
    return NextResponse.json(
      {
        translatedText: translated,
        detectedSourceLanguage: data.data?.translations?.[0]?.detectedSourceLanguage,
      },
      { headers: { 'X-RateLimit-Remaining': String(remaining) } }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
