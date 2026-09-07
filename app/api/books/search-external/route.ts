import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-user';
import { searchExternalBooks, ExternalSearchError } from '@/lib/openlibrary';
import { errorResponse } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: Request) {
  try {
    const userId = await getCurrentUserId();

    const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
    if (!q) {
      return NextResponse.json(
        { error: 'Informe o que buscar' }, { status: 400 });
    }

    const rate = checkRateLimit(`external-search:${userId}`, 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Muitas buscas em pouco tempo. Tente novamente em instantes.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
      );
    }

    const resultados = await searchExternalBooks(q);
    return NextResponse.json({ resultados });
  } catch (err) {
    if (err instanceof ExternalSearchError) {
      return NextResponse.json(
        { error: 'Não foi possível buscar agora. Preencha manualmente.' },
        { status: 503 }
      );
    }
    return errorResponse(err, 'Erro ao buscar livros');
  }
}
