import { getCurrentUserId } from '@/lib/auth-user';
import { fetchReadingStats } from '@/lib/db/queries';
import { errorResponse } from '@/lib/errors';
import { NextResponse } from 'next/server';

// A lógica mora em fetchReadingStats (lib/db/queries.ts): a mesma função
// alimenta o painel renderizado no servidor e esta rota, que os testes de
// API exercitam contra um banco real. AD-7 da spec do tracker: leitura
// ignora posse — apagar um livro do Calibre não apaga o histórico de que
// ele foi lido.
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const data = await fetchReadingStats(userId);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err, 'Erro ao calcular estatísticas');
  }
}
