// lib/db/sync-files.ts
// Sobe os arquivos de leitura (EPUB/PDF) dos livros marcados no app
// (`ready_to_read = true`) do Calibre local para o Supabase Storage.
// Só funciona na máquina do dono, onde a biblioteca do Calibre existe.
//
// Uso:
//   pnpm db:sync-files --email=voce@exemplo.com
//   pnpm db:sync-files --email=voce@exemplo.com --book-id=123
//   pnpm db:sync-files --email=voce@exemplo.com --forcar
import 'dotenv/config';
import fs from 'fs';
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { client, db } from './drizzle';
import { appUsers, books, bookFiles } from './schema';
import { withUser } from './with-user';
import { readCalibreBookFile, readCalibreLibrary } from './calibre-reader';
import { uploadBookFile, StorageQuotaError } from '@/lib/storage';

const MAX_TOTAL_BYTES = Number(process.env.BOOK_FILES_MAX_BYTES ?? 800 * 1024 * 1024);
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function argValue(prefix: string): string | undefined {
    const a = process.argv.find((x) => x.startsWith(prefix));
    return a ? a.slice(prefix.length) : undefined;
}

function calibrePathFromArgs(): string {
    return (
        argValue('--path=') ??
        process.env.CALIBRE_PATH ??
        'C:\\Livros\\Calibre Portable\\Calibre Library'
    );
}

async function resolveUserId(email: string): Promise<string> {
    if (!email?.trim()) {
        throw new Error(
            'Informe o e-mail: pnpm db:sync-files -- --email=voce@exemplo.com'
        );
    }
    const normalized = email.trim().toLowerCase();
    const [user] = await db
        .insert(appUsers)
        .values({ email: normalized })
        .onConflictDoUpdate({
            target: appUsers.email,
            set: { email: normalized },
        })
        .returning({ id: appUsers.id });
    return user.id;
}

interface BookParaSubir {
    bookId: number;
    uuid: string;
    title: string;
}

async function loadReadyBooks(userId: string, onlyBookId?: number): Promise<BookParaSubir[]> {
    return withUser(userId, (tx) =>
        tx
            .select({
                bookId: books.id,
                uuid: books.calibre_uuid,
                title: books.title,
            })
            .from(books)
            .where(
                and(
                    eq(books.source, 'calibre'),
                    eq(books.ready_to_read, true),
                    onlyBookId ? eq(books.id, onlyBookId) : sql`true`
                )
            )
    ) as Promise<BookParaSubir[]>;
}

async function usedBytes(userId: string): Promise<number> {
    const rows = await withUser(userId, (tx) =>
        tx
            .select({ total: sql<number>`coalesce(sum(${bookFiles.size}), 0)` })
            .from(bookFiles)
            .where(eq(bookFiles.userId, userId))
    );
    return Number(rows[0]?.total ?? 0);
}

async function main() {
    const email = argValue('--email=') ?? '';
    const userId = await resolveUserId(email);
    const calibrePath = calibrePathFromArgs();
    const onlyBookId = argValue('--book-id=') ? Number(argValue('--book-id=')) : undefined;
    const forcar = argValue('--forcar') !== undefined;

    if (!fs.existsSync(calibrePath)) {
        console.error(`Caminho do Calibre não encontrado: ${calibrePath}`);
        process.exitCode = 1;
        return;
    }

    const livrosCalibre = await readCalibreLibrary(calibrePath);
    const porUuid = new Map(livrosCalibre.map((l) => [l.uuid, l]));

    const marcados = await loadReadyBooks(userId, onlyBookId);
    console.log(`📖 ${marcados.length} livro(s) marcado(s) para leitura\n`);

    let base = await usedBytes(userId);
    let subidos = 0;
    let pulados = 0;
    let erros = 0;

    for (const marcado of marcados) {
        const livro = porUuid.get(marcado.uuid);
        if (!livro) {
            console.warn(`⚠️  "${marcado.title}" não está mais no Calibre.`);
            pulados++;
            continue;
        }

        try {
            const arquivo = readCalibreBookFile(calibrePath, livro.path);
            if (!arquivo) {
                console.warn(`⚠️  "${marcado.title}" não tem EPUB/PDF na pasta.`);
                pulados++;
                continue;
            }

            if (arquivo.size > MAX_FILE_BYTES) {
                console.warn(
                    `⚠️  "${marcado.title}" tem ${(arquivo.size / 1024 / 1024).toFixed(1)}MB — acima do limite de ${MAX_FILE_BYTES / 1024 / 1024}MB.`
                );
                pulados++;
                continue;
            }

            if (!forcar && base + arquivo.size > MAX_TOTAL_BYTES) {
                console.error(
                    `⛔  Estouraria a cota (${(base / 1024 / 1024).toFixed(1)}MB usados + ${(arquivo.size / 1024 / 1024).toFixed(1)}MB). ` +
                        `Rode com --forcar para ignorar ou remova livros marcados.`
                );
                erros++;
                continue;
            }

            const buf = fs.readFileSync(arquivo.filePath);
            const hash = createHash('sha256').update(buf).digest('hex');

            const [atual] = await withUser(userId, (tx) =>
                tx
                    .select({ sha256: bookFiles.sha256, hasFile: bookFiles.hasFile })
                    .from(bookFiles)
                    .where(eq(bookFiles.bookId, marcado.bookId))
                    .limit(1)
            );

            if (atual?.hasFile && atual.sha256 === hash) {
                pulados++;
                continue;
            }

            const storagePath = await uploadBookFile(userId, marcado.bookId, buf, arquivo.format);
            await withUser(userId, (tx) =>
                tx
                    .insert(bookFiles)
                    .values({
                        userId,
                        bookId: marcado.bookId,
                        format: arquivo.format,
                        storagePath,
                        mime: arquivo.format === 'pdf' ? 'application/pdf' : 'application/epub+zip',
                        size: arquivo.size,
                        sha256: hash,
                        hasFile: true,
                    })
                    .onConflictDoUpdate({
                        target: bookFiles.bookId,
                        set: {
                            format: arquivo.format,
                            storagePath,
                            mime: arquivo.format === 'pdf' ? 'application/pdf' : 'application/epub+zip',
                            size: arquivo.size,
                            sha256: hash,
                            hasFile: true,
                            updatedAt: new Date(),
                        },
                    })
            );
            await withUser(userId, (tx) =>
                tx
                    .update(books)
                    .set({ has_file: true })
                    .where(eq(books.id, marcado.bookId))
            );

            base += arquivo.size;
            subidos++;
            console.log(`✅ ${marcado.title}`);
        } catch (error) {
            erros++;
            if (error instanceof StorageQuotaError) {
                console.error(`⛔  Cota do Storage esgotada: ${marcado.title}`);
            } else {
                console.error(`❌ ${marcado.title}:`, error);
            }
        }
    }

    console.log('\n─────────────────────────────────');
    console.log(`✅ Subidos:   ${subidos}`);
    console.log(`⏭️  Pulados:   ${pulados}`);
    console.log(`❌ Erros:     ${erros}`);
    console.log(`📦 Total em uso: ${(base / 1024 / 1024).toFixed(1)}MB`);
    console.log('─────────────────────────────────');
}

const isMain = process.argv[1] !== undefined
    && import.meta.url === pathToFileURL(process.argv[1]).href;

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
