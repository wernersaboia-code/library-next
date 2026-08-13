import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL não definida em .env.test — veja docs/superpowers/plans/2026-08-11-fundacao.md, Task 3.'
    );
  }
  return url;
}
