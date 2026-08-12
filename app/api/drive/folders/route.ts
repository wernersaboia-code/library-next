import { getDriveToken, DriveAuthError } from '@/lib/auth';
import { fetchDriveFolders } from '@/lib/drive';
import { NextResponse } from 'next/server';

export async function GET() {
  let accessToken: string;
  try {
    accessToken = await getDriveToken();
  } catch (err) {
    if (err instanceof DriveAuthError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  try {
    const folders = await fetchDriveFolders(accessToken);
    return NextResponse.json(folders);
  } catch (err) {
    return NextResponse.json(
      { error: 'Erro ao listar pastas', details: String(err) },
      { status: 500 }
    );
  }
}
