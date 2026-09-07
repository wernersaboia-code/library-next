// Este script é o único consumidor da conexão owner. A aplicação usa
// POSTGRES_URL com o papel book_app, que não deve poder alterar o schema.
import 'dotenv/config';
import path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.POSTGRES_MIGRATION_URL;
if (!url) throw new Error('POSTGRES_MIGRATION_URL environment variable is not set');

const client = postgres(url, { prepare: false });
const db = drizzle(client);

async function main() {
  await migrate(db, { migrationsFolder: path.join(__dirname, './migrations') });
  console.log(`Migrations complete`);
  await client.end();
}

main();
