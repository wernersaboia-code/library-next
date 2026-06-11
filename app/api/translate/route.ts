import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { text, source, target } = await req.json();
  if (!text || !target)
    return NextResponse.json({ error: 'text e target obrigatórios' }, { status: 400 });

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: 'API key não configurada' }, { status: 501 });

  try {
    const params = new URLSearchParams({
      q: text,
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
    return NextResponse.json({ translatedText: translated, detectedSourceLanguage: data.data?.translations?.[0]?.detectedSourceLanguage });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
