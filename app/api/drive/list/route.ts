import { getDriveToken, DriveAuthError } from '@/lib/auth';
import { fetchDriveFiles } from '@/lib/drive';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  let accessToken: string;
  try {
    accessToken = await getDriveToken();
  } catch (err) {
    if (err instanceof DriveAuthError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get('folderId');
  if (!folderId)
    return NextResponse.json({ error: 'folderId é obrigatório' }, { status: 400 });

  try {
    const result = await fetchDriveFiles(accessToken, folderId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'Erro ao listar arquivos', details: String(err) },
      { status: 500 }
    );
  }
}
