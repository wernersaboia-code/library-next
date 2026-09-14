// lib/db/setup-storage.ts
// Cria os buckets do Supabase Storage que a aplicação usa, se faltarem:
// `covers` (público, capas) e `book-files` (privado, EPUB/PDF). Idempotente —
// pode rodar quantas vezes quiser.
//
// Uso: pnpm db:setup-storage
import 'dotenv/config';
import { ensureStorageBuckets } from '@/lib/storage';

(async () => {
  const criados = await ensureStorageBuckets();
  if (criados.length === 0) {
    console.log('✅ Buckets já existem: covers, book-files');
  } else {
    console.log(`✅ Buckets criados: ${criados.join(', ')}`);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
