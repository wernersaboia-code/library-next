import { auth } from '@/lib/auth';
import { fetchDriveFiles } from '@/lib/drive';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get('folderId');
  if (!folderId)
    return NextResponse.json({ error: 'folderId é obrigatório' }, { status: 400 });

  try {
    const result = await fetchDriveFiles(session.accessToken, folderId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'Erro ao listar arquivos', details: String(err) },
      { status: 500 }
    );
  }
}
