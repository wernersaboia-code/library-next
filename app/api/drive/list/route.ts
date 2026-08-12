import { getDriveToken } from '@/lib/auth';
import { fetchAllDriveFiles } from '@/lib/drive';
import { errorResponse } from '@/lib/errors';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get('folderId');
  if (!folderId)
    return NextResponse.json({ error: 'folderId é obrigatório' }, { status: 400 });

  try {
    const accessToken = await getDriveToken();
    const files = await fetchAllDriveFiles(accessToken, folderId);
    return NextResponse.json({ files });
  } catch (err) {
    return errorResponse(err, 'Erro ao listar arquivos');
  }
}
