// `import 'dotenv/config'` carrega o .env como efeito de import, na ordem
// dos imports — ANTES de `./drizzle`, que lê POSTGRES_URL no import. Um
// `dotenv.config()` como statement rodaria tarde demais (imports são hoisted).
import 'dotenv/config';
import path from 'path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { client, db } from './drizzle';

async function main() {
  await migrate(db, { migrationsFolder: path.join(__dirname, './migrations') });
  console.log(`Migrations complete`);
  await client.end();
}

main();
