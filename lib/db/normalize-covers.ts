// lib/db/normalize-covers.ts
// Reprocessa as capas que já estão no bucket `covers`: baixa, redimensiona e
// recomprime (800x1200, JPEG q80), subindo de volta no mesmo lugar. É o que
// reduz o consumo das capas antigas, gravadas em resolução cheia.
//
// A lista de capas vem do banco (`books.image_url`), não de varrer o bucket:
// o Storage não tem listagem recursiva, e descer pasta a pasta fazia uma
// chamada por livro — lento e sujeito a rate limit.
//
// Uso:
//   pnpm db:normalize-covers                      # dry-run: só estima
//   pnpm db:normalize-covers -- --apply           # reprocessa de verdade
//   pnpm db:normalize-covers -- --user=voce@exemplo.com
//   pnpm db:normalize-covers -- --limit=20        # testa num punhado antes
//   pnpm db:normalize-covers -- --min-kb=120      # ignora capas já pequenas
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { eq, isNotNull } from 'drizzle-orm';
import { client, db } from './drizzle';
import { appUsers, books } from './schema';
import { withUser } from './with-user';
import {
  COVERS_BUCKET,
  downloadObject,
  removeObjects,
  uploadCover,
} from '@/lib/storage';
import { normalizarCapa } from '@/lib/covers';

const MARCADOR_COVERS = '/covers/';

// Só re-sobe se a normalização economizar de fato. Recomprimir um JPEG já
// otimizado dá ganho de poucos %, e sem esta margem o script re-subia todas
// as capas a cada execução sem nunca convergir.
const GANHO_MINIMO = 0.9;

function argValue(prefix: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : undefined;
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

/** Extrai o caminho dentro do bucket `covers` a partir da URL pública. */
function caminhoDaCapa(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  const i = imageUrl.indexOf(MARCADOR_COVERS);
  return i === -1 ? null : imageUrl.slice(i + MARCADOR_COVERS.length);
}

interface CapaRef {
  userId: string;
  bookId: number;
  path: string;
}

async function uidPorEmail(email: string): Promise<string> {
  const normalizado = email.trim().toLowerCase();
  const [u] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.email, normalizado));
  if (!u) throw new Error(`Usuário não encontrado: ${email}`);
  return u.id;
}

/** Capas do banco de cada usuário (opcionalmente um só), com o caminho no bucket. */
async function capasDoBanco(uidFiltro: string | null): Promise<CapaRef[]> {
  const usuarios = uidFiltro
    ? [{ id: uidFiltro }]
    : await db.select({ id: appUsers.id }).from(appUsers);

  const refs: CapaRef[] = [];
  for (const u of usuarios) {
    const linhas = await withUser(u.id, (tx) =>
      tx
        .select({ id: books.id, imageUrl: books.image_url })
        .from(books)
        .where(isNotNull(books.image_url))
    );
    for (const l of linhas) {
      const path = caminhoDaCapa(l.imageUrl);
      if (path) refs.push({ userId: u.id, bookId: l.id, path });
    }
  }
  return refs;
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const email = argValue('--user=');
  const limite = Number(argValue('--limit=') ?? 0);
  const minBytes = Number(argValue('--min-kb=') ?? 80) * 1024;

  const uidFiltro = email ? await uidPorEmail(email) : null;
  const capas = await capasDoBanco(uidFiltro);

  console.log(`🖼️  Capas no banco: ${capas.length}`);
  if (aplicar) console.log('⚠️  Modo --apply: as capas serão sobrescritas.\n');
  else console.log('ℹ️  Dry-run. Use --apply para reprocessar.\n');

  let processados = 0;
  let otimizadas = 0;
  let puladas = 0;
  let erros = 0;
  let bytesAntes = 0;
  let bytesDepois = 0;

  for (const capa of capas) {
    if (limite > 0 && processados >= limite) break;
    processados++;

    try {
      const original = await downloadObject(COVERS_BUCKET, capa.path);

      // Já é pequena: não vale recomprimir.
      if (original.length < minBytes) {
        puladas++;
        continue;
      }

      const { buf: normalizada, ext } = await normalizarCapa(original);

      // Ganho pequeno (já otimizada): não compensa re-subir.
      if (normalizada.length >= original.length * GANHO_MINIMO) {
        puladas++;
        continue;
      }

      otimizadas++;
      bytesAntes += original.length;
      bytesDepois += normalizada.length;
      console.log(
        `✅ ${capa.path} — ${mb(original.length)}MB → ${mb(normalizada.length)}MB`
      );

      if (!aplicar) continue;

      const imageUrl = await uploadCover(capa.userId, capa.bookId, normalizada, ext);
      await withUser(capa.userId, (tx) =>
        tx.update(books).set({ image_url: imageUrl }).where(eq(books.id, capa.bookId))
      );
      // Quando o caminho não muda, o upload já sobrescreveu. Quando muda
      // (png→jpg), removemos o antigo — o cleanup-storage cobre o resto.
      const novoCaminho = `${capa.userId}/${capa.bookId}/cover.${ext}`;
      if (novoCaminho !== capa.path) {
        await removeObjects(COVERS_BUCKET, [capa.path]);
      }
    } catch (error) {
      erros++;
      console.error(`❌ ${capa.path}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log('\n─────────────────────────────────');
  console.log(`✅ Otimizadas: ${otimizadas}`);
  console.log(`⏭️  Já enxutas: ${puladas}`);
  console.log(`❌ Erros:      ${erros}`);
  console.log(`📉 ${mb(bytesAntes)}MB → ${mb(bytesDepois)}MB (economia de ${mb(bytesAntes - bytesDepois)}MB)`);
  if (!aplicar) console.log('\nℹ️  Dry-run: nada foi alterado.');
  console.log('─────────────────────────────────');
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => {
      void client.end();
    });
}
