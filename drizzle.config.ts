import type { Config } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.POSTGRES_MIGRATION_URL ?? process.env.POSTGRES_URL;
if (!url) {
  throw new Error(
    'Defina POSTGRES_MIGRATION_URL (papel owner) ou POSTGRES_URL no .env'
  );
}

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url,
  },
} satisfies Config;
