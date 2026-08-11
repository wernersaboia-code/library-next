import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const url = process.env.POSTGRES_URL;
if (!url) throw new Error('POSTGRES_URL environment variable is not set');

export const client = postgres(url, {
  max: 10,
  idle_timeout: 20,
  prepare: false, // obrigatório com o pooler em modo transaction do Supabase
});

export const db = drizzle(client, { schema });
