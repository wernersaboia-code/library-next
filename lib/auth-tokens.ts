import 'server-only';

export class DriveAuthError extends Error {
  constructor(message = 'Acesso ao Google Drive precisa ser reautorizado') {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.AUTH_ALLOWED_EMAILS ?? '';
  const allowed = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false; // falha fechado
  return allowed.includes(email.trim().toLowerCase());
}

export async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? '',
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${data.error ?? res.status}`);
  }

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    refreshToken: data.refresh_token,
  };
}
