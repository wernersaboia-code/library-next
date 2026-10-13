import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-user';
import { searchMetadata } from '@/lib/metadata';
import { errorResponse } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: Request) {
  try {
    const userId = await getCurrentUserId();

    const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
    if (!q || q.length > 300) {
      return NextResponse.json(
        { error: 'Informe uma busca de até 300 caracteres' }, { status: 400 });
    }

    // Mais baixo que a busca antiga: agora são várias fontes por consulta.
    const rate = checkRateLimit(`metadata-search:${userId}`, 15, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Muitas buscas em pouco tempo. Tente novamente em instantes.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
      );
    }

    const { books, falhas, allFailed } = await searchMetadata(q);

    // Todas as fontes caíram: trata como indisponível, não como "nada achado".
    if (allFailed) {
      return NextResponse.json(
        { error: 'Não foi possível buscar agora. Preencha manualmente.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ resultados: books, falhas });
  } catch (err) {
    return errorResponse(err, 'Erro ao buscar metadados');
  }
}
