// lib/db/cleanup-storage.ts
// Remove do Supabase Storage objetos que não têm mais dono no banco, para
// liberar espaço — é o bucket (book-files + covers) que estoura a cota de
// "storage size" do Supabase.
//
// Uso:
//   pnpm db:cleanup-storage                         # dry-run: só relata
//   pnpm db:cleanup-storage -- --apply              # remove de verdade
//   pnpm db:cleanup-storage -- --apply --unready    # remove também arquivos
//                                                   # de livros desmarcados
//   pnpm db:cleanup-storage -- --user=voce@exemplo.com
//
// Órfãos:
//   - objetos em `book-files` sem linha correspondente em book_files;
//   - objetos em `covers` sem livro apontando para eles em image_url.
// Com --unready, entram também os arquivos de livros com ready_to_read=false
// (a linha em book_files e o has_file do livro são limpos junto).
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { client, db } from './drizzle';
import { appUsers, books, bookFiles } from './schema';
import { withUser } from './with-user';
import {
  BOOK_FILES_BUCKET,
  COVERS_BUCKET,
  listAllObjects,
  removeObjects,
  type StorageObject,
} from '@/lib/storage';

function argValue(prefix: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : undefined;
}

interface UsuarioDb {
  id: string;
  email: string;
}

interface ArquivoDb {
  bookId: number;
  storagePath: string;
  size: number;
}

interface LivroDb {
  id: number;
  imageUrl: string | null;
  readyToRead: boolean;
}

/** Extrai o caminho dentro do bucket `covers` a partir da URL pública. */
function caminhoDaCapa(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  const marcador = '/covers/';
  const i = imageUrl.indexOf(marcador);
  return i === -1 ? null : imageUrl.slice(i + marcador.length);
}

async function usuariosAlvo(email?: string): Promise<UsuarioDb[]> {
  if (email) {
    const normalizado = email.trim().toLowerCase();
    const [u] = await db
      .select({ id: appUsers.id, email: appUsers.email })
      .from(appUsers)
      .where(eq(appUsers.email, normalizado));
    if (!u) throw new Error(`Usuário não encontrado: ${email}`);
    return [u];
  }
  return db.select({ id: appUsers.id, email: appUsers.email }).from(appUsers);
}

function soma(objetos: StorageObject[]): number {
  return objetos.reduce((s, o) => s + o.size, 0);
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const incluirNaoMarcados = process.argv.includes('--unready');
  const email = argValue('--user=');

  const usuarios = await usuariosAlvo(email);
  const referenciadosBook = new Set<string>();
  const referenciadosCover = new Set<string>();
  const arquivosNaoMarcados: Array<{ userId: string } & ArquivoDb> = [];

  for (const u of usuarios) {
    const [arquivos, livros] = await Promise.all([
      withUser(u.id, (tx) =>
        tx
          .select({
            bookId: bookFiles.bookId,
            storagePath: bookFiles.storagePath,
            size: bookFiles.size,
          })
          .from(bookFiles)
      ) as Promise<ArquivoDb[]>,
      withUser(u.id, (tx) =>
        tx
          .select({
            id: books.id,
            imageUrl: books.image_url,
            readyToRead: books.ready_to_read,
          })
          .from(books)
      ) as Promise<LivroDb[]>,
    ]);

    const marcadoPorId = new Map(livros.map((l) => [l.id, l.readyToRead]));
    for (const a of arquivos) {
      referenciadosBook.add(a.storagePath);
      if (incluirNaoMarcados && marcadoPorId.get(a.bookId) !== true) {
        arquivosNaoMarcados.push({ userId: u.id, ...a });
      }
    }
    for (const l of livros) {
      const caminho = caminhoDaCapa(l.imageUrl);
      if (caminho) referenciadosCover.add(caminho);
    }
  }

  const [objetosBook, objetosCover] = await Promise.all([
    listAllObjects(BOOK_FILES_BUCKET),
    listAllObjects(COVERS_BUCKET),
  ]);

  const orfaosBook = objetosBook.filter((o) => !referenciadosBook.has(o.path));
  const orfaosCover = objetosCover.filter((o) => !referenciadosCover.has(o.path));

  const bytesBook = soma(orfaosBook) + arquivosNaoMarcados.reduce((s, a) => s + a.size, 0);
  const bytesCover = soma(orfaosCover);

  console.log(`👤 Usuário(s) analisado(s): ${usuarios.length}`);
  console.log(`🗂️  ${BOOK_FILES_BUCKET}: ${objetosBook.length} objeto(s)`);
  console.log(`🖼️  ${COVERS_BUCKET}: ${objetosCover.length} objeto(s)`);
  console.log('\n─────────────────────────────────');
  console.log(`🗑️  Órfãos em ${BOOK_FILES_BUCKET}: ${orfaosBook.length} (${mb(soma(orfaosBook))}MB)`);
  console.log(`🗑️  Órfãos em ${COVERS_BUCKET}: ${orfaosCover.length} (${mb(soma(orfaosCover))}MB)`);
  if (incluirNaoMarcados) {
    console.log(
      `🗑️  Arquivos de livros desmarcados: ${arquivosNaoMarcados.length} (${mb(arquivosNaoMarcados.reduce((s, a) => s + a.size, 0))}MB)`
    );
  }
  console.log(`\n📦 Total a liberar: ${mb(bytesBook + bytesCover)}MB`);
  console.log('─────────────────────────────────');

  if (!aplicar) {
    console.log('\nℹ️  Dry-run: nada foi removido. Rode com --apply para remover.');
    return;
  }

  const caminhosBook = [
    ...orfaosBook.map((o) => o.path),
    ...arquivosNaoMarcados.map((a) => a.storagePath),
  ];
  const removidosBook = await removeObjects(BOOK_FILES_BUCKET, caminhosBook);
  const removidosCover = await removeObjects(COVERS_BUCKET, orfaosCover.map((o) => o.path));

  for (const a of arquivosNaoMarcados) {
    await withUser(a.userId, async (tx) => {
      await tx.delete(bookFiles).where(eq(bookFiles.bookId, a.bookId));
      await tx.update(books).set({ has_file: false }).where(eq(books.id, a.bookId));
    });
  }

  console.log(
    `\n✅ Removidos: ${removidosBook} de ${BOOK_FILES_BUCKET}, ${removidosCover} de ${COVERS_BUCKET}`
  );
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
