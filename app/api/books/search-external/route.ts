import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-user';
import { searchExternalBooks, ExternalSearchError } from '@/lib/openlibrary';
import { errorResponse } from '@/lib/errors';

export async function GET(req: Request) {
  try {
    await getCurrentUserId();   // exige sessão; não usa o id (não toca o banco)

    const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
    if (!q) {
      return NextResponse.json(
        { error: 'Informe o que buscar' }, { status: 400 });
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
