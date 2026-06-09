import { auth } from '@/lib/auth';
import { fetchDriveFolders } from '@/lib/drive';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const folders = await fetchDriveFolders(session.accessToken);
    return NextResponse.json(folders);
  } catch (err) {
    return NextResponse.json(
      { error: 'Erro ao listar pastas', details: String(err) },
      { status: 500 }
    );
  }
}
