import { getDriveToken } from '@/lib/auth';
import { fetchDriveFolders } from '@/lib/drive';
import { errorResponse } from '@/lib/errors';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const accessToken = await getDriveToken();
    const folders = await fetchDriveFolders(accessToken);
    return NextResponse.json(folders);
  } catch (err) {
    return errorResponse(err, 'Erro ao listar pastas');
  }
}
