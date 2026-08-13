import { NextResponse } from 'next/server';
import { getCurrentUser, ensureAppUser } from '@/lib/auth-user';
import { errorResponse } from '@/lib/errors';

export async function POST() {
  try {
    const { id, email } = await getCurrentUser();
    await ensureAppUser(id, email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao inicializar a conta');
  }
}
