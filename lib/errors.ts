import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { DriveAuthError } from './auth-tokens';
import { StorageQuotaError } from './storage';

export function errorResponse(err: unknown, mensagem: string): NextResponse {
  const requestId = randomUUID();

  console.error(JSON.stringify({
    level: 'error',
    requestId,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    timestamp: new Date().toISOString(),
  }));

  if (err instanceof DriveAuthError) {
    return NextResponse.json(
      { error: 'Acesso ao Google Drive expirou. Entre novamente.', requestId },
      { status: 401 }
    );
  }

  if (err instanceof StorageQuotaError) {
    return NextResponse.json(
      { error: 'Espaço de armazenamento esgotado.', requestId },
      { status: 507 }
    );
  }

  return NextResponse.json({ error: mensagem, requestId }, { status: 500 });
}
