import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-user';
import { translateText } from '@/lib/translate';
import { checkRateLimit } from '@/lib/rate-limit';
import { errorResponse } from '@/lib/errors';

const HOURLY_LIMIT = Number(process.env.TRANSLATE_HOURLY_LIMIT ?? 200);

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();

    const body = await req.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return NextResponse.json({ error: 'Informe o texto a traduzir' }, { status: 400 });
    }
    if (text.length > 5000) {
      return NextResponse.json(
        { error: 'Selecione um trecho menor (até 5.000 caracteres)' },
        { status: 400 }
      );
    }

    const rate = checkRateLimit(`translate:${userId}`, HOURLY_LIMIT, 60 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Limite de traduções atingido. Tente mais tarde.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
      );
    }

    const translated = await translateText(text);
    return NextResponse.json({ translated });
  } catch (err) {
    return errorResponse(err, 'Erro ao traduzir');
  }
}
