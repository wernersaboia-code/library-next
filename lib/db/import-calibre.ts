// lib/db/import-calibre.ts
// Carrega o .env antes de `./drizzle` (que lê POSTGRES_URL no import).
// Como efeito de import, roda na ordem dos imports — diferente de um
// `dotenv.config()` statement, que rodaria depois de todos os imports.
import 'dotenv/config';
import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import * as ThumbHash from 'thumbhash';
import { eq } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { client, db } from './drizzle';
import { books, authors, bookToAuthor, appUsers } from './schema';
import { withUser } from './with-user';
// `uploadCover` vive em um módulo marcado com `import 'server-only'`
// (proteção contra bundle de cliente no Next.js). Fora do Next, esse pacote
// lança incondicionalmente ao ser importado — por isso `pnpm
// db:import-calibre` roda com `tsx --conditions=react-server`, que faz o
// Node resolver `server-only` para o stub vazio em vez do throw.
import { authorId } from '@/lib/authors';
import { uploadCover } from '@/lib/storage';

// ─── Configuração ─────────────────────────────────────────────
// Caminho da biblioteca Calibre: --path=... na linha de comando, ou a env
// CALIBRE_PATH, ou o default. Ex.: pnpm db:import-calibre --email=... --path="G:\Meu Drive\Livros"
function argValue(prefix: string): string | undefined {
    const a = process.argv.find((x) => x.startsWith(prefix));
    return a ? a.slice(prefix.length) : undefined;
}
const CALIBRE_PATH =
    argValue('--path=') ??
    process.env.CALIBRE_PATH ??
    'C:\\Livros\\Calibre Portable\\Calibre Library';
const CALIBRE_DB   = path.join(CALIBRE_PATH, 'metadata.db');

// ─── Usuário dono da importação ───────────────────────────────
/**
 * Faz upsert em `app_users` pelo e-mail informado em `--email=` e devolve o
 * id. É o dono de todos os livros importados desta execução.
 */
export async function resolveUserId(email: string): Promise<string> {
    if (!email?.trim()) {
        throw new Error(
            'Informe o e-mail: pnpm db:import-calibre -- --email=voce@exemplo.com'
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

// ─── ThumbHash ────────────────────────────────────────────────
async function generateThumbHash(imageBuffer: Buffer): Promise<string | null> {
    try {
        const { data, info } = await sharp(imageBuffer)
            .resize(100, 100, { fit: 'inside' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const binary = ThumbHash.rgbaToThumbHash(info.width, info.height, data);
        return Buffer.from(binary).toString('base64');
    } catch {
        return null;
    }
}

// ─── Capa do livro ────────────────────────────────────────────
/** Lê o buffer de `cover.jpg` no Calibre, se existir. */
function readCoverBuffer(bookPath: string): Buffer | null {
    const coverPath = path.join(CALIBRE_PATH, bookPath, 'cover.jpg');
    if (!fs.existsSync(coverPath)) return null;
    return fs.readFileSync(coverPath);
}

// ─── Helper: query com parâmetros ─────────────────────────────
function query<T>(
    db: import('sql.js').Database,
    sql: string,
    params: (string | number | null)[] = []
): T[] {
    const stmt   = db.prepare(sql);
    const rows: T[] = [];

    stmt.bind(params);
    while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
}

function queryOne<T>(
    db: import('sql.js').Database,
    sql: string,
    params: (string | number | null)[] = []
): T | undefined {
    const results = query<T>(db, sql, params);
    return results[0];
}

// ─── Tipos ────────────────────────────────────────────────────
interface CalibreBook {
    id: number;
    title: string;
    pubdate: string | null;
    series_index: number | null;
    path: string;
    has_cover: number;
}

interface CalibreAuthor    { name: string }
interface CalibreTag       { name: string }
interface CalibreSeries    { name: string }
interface CalibrePublisher { name: string }
interface CalibreLanguage  { lang_code: string }
interface CalibreRating    { rating: number }
interface CalibreComment   { text: string }
interface CalibrePages     { pages: number }
interface CalibreIdentifier{ type: string; val: string }

// ─── Main ─────────────────────────────────────────────────────
async function main() {
    console.log('📚 Iniciando importação do Calibre...\n');

    if (!fs.existsSync(CALIBRE_DB)) {
        throw new Error(`metadata.db não encontrado em: ${CALIBRE_DB}`);
    }

    const email = process.argv
        .find((a) => a.startsWith('--email='))?.split('=')[1] ?? '';
    const userId = await resolveUserId(email);

    // Carrega o banco SQLite em memória
    const SQL      = await initSqlJs();
    const fileBuffer = fs.readFileSync(CALIBRE_DB);
    const calibre  = new SQL.Database(fileBuffer);

    // Busca todos os livros
    const calibreBooks = query<CalibreBook>(
        calibre,
        'SELECT id, title, pubdate, series_index, path, has_cover FROM books ORDER BY id'
    );

    console.log(`📖 ${calibreBooks.length} livros encontrados no Calibre\n`);

    let importados = 0;
    let ignorados  = 0;
    let erros      = 0;

    for (const book of calibreBooks) {
        try {
            // ── Autores ──────────────────────────────────────────
            const calibreAuthors = query<CalibreAuthor>(
                calibre,
                `SELECT a.name
         FROM authors a
         JOIN books_authors_link bal ON bal.author = a.id
         WHERE bal.book = ?`,
                [book.id]
            );

            // ── Tags → Gênero ────────────────────────────────────
            const tags = query<CalibreTag>(
                calibre,
                `SELECT t.name
         FROM tags t
         JOIN books_tags_link btl ON btl.tag = t.id
         WHERE btl.book = ?
         ORDER BY t.name`,
                [book.id]
            );

            // ── Série ─────────────────────────────────────────────
            const seriesRow = queryOne<CalibreSeries>(
                calibre,
                `SELECT s.name
         FROM series s
         JOIN books_series_link bsl ON bsl.series = s.id
         WHERE bsl.book = ?
         LIMIT 1`,
                [book.id]
            );

            // ── Editora ───────────────────────────────────────────
            const publisherRow = queryOne<CalibrePublisher>(
                calibre,
                `SELECT p.name
         FROM publishers p
         JOIN books_publishers_link bpl ON bpl.publisher = p.id
         WHERE bpl.book = ?
         LIMIT 1`,
                [book.id]
            );

            // ── Idioma ────────────────────────────────────────────
            const langRow = queryOne<CalibreLanguage>(
                calibre,
                `SELECT l.lang_code
         FROM languages l
         JOIN books_languages_link bll ON bll.lang_code = l.id
         WHERE bll.book = ?
         LIMIT 1`,
                [book.id]
            );

            // ── Avaliação (0-10 no Calibre → 0-5 aqui) ───────────
            const ratingRow = queryOne<CalibreRating>(
                calibre,
                `SELECT r.rating
         FROM ratings r
         JOIN books_ratings_link brl ON brl.rating = r.id
         WHERE brl.book = ?
         LIMIT 1`,
                [book.id]
            );

            // ── Descrição ─────────────────────────────────────────
            const commentRow = queryOne<CalibreComment>(
                calibre,
                'SELECT text FROM comments WHERE book = ? LIMIT 1',
                [book.id]
            );

            // ── Páginas ───────────────────────────────────────────
            const pagesRow = queryOne<CalibrePages>(
                calibre,
                'SELECT pages FROM books_pages_link WHERE book = ? LIMIT 1',
                [book.id]
            );

            // ── Identificadores (ISBN) ────────────────────────────
            const identifiers = query<CalibreIdentifier>(
                calibre,
                'SELECT type, val FROM identifiers WHERE book = ?',
                [book.id]
            );

            const isbn   = identifiers.find(i => i.type === 'isbn')?.val   ?? null;
            const isbn13 = identifiers.find(i => i.type === 'isbn13')?.val ?? null;

            // ── Ano de publicação ─────────────────────────────────
            const pubYear = book.pubdate
                ? new Date(book.pubdate).getFullYear()
                : null;
            const publicationYear =
                pubYear && pubYear > 1000 ? pubYear : null;

            // ── Gênero (primeira tag) ─────────────────────────────
            const genre = tags.length > 0 ? tags[0].name : null;

            // ── Avaliação ─────────────────────────────────────────
            const averageRating = ratingRow
                ? String((ratingRow.rating / 2).toFixed(2))
                : null;

            // ── Inserir autores (globais, sem RLS, fora do withUser) ──
            const authorIds: string[] = [];

            for (const a of calibreAuthors) {
                const id = authorId(a.name);

                await db
                    .insert(authors)
                    .values({ id, name: a.name })
                    .onConflictDoNothing();

                authorIds.push(id);
            }

            // ── Inserir livro + vínculos com autor ────────────────
            const bookId = await withUser(userId, async (tx) => {
                const [inserted] = await tx
                    .insert(books)
                    .values({
                        userId,
                        isbn,
                        isbn13,
                        title: book.title,
                        publication_year: publicationYear,
                        publisher: publisherRow?.name ?? null,
                        series: seriesRow
                            ? `${seriesRow.name}${book.series_index ? ` #${book.series_index}` : ''}`
                            : null,
                        language_code: langRow?.lang_code ?? null,
                        description: commentRow?.text ?? null,
                        genre,
                        num_pages: pagesRow?.pages ?? null,
                        average_rating: averageRating,
                        read_status: 'não lido',
                        title_source: book.title,
                    })
                    .onConflictDoNothing()
                    .returning({ id: books.id });

                if (!inserted) return null;

                for (const authId of authorIds) {
                    await tx
                        .insert(bookToAuthor)
                        .values({ bookId: inserted.id, authorId: authId })
                        .onConflictDoNothing();
                }

                return inserted.id;
            });

            if (bookId !== null) {
                // ── Capa: upload para o Storage, nunca caminho local ──
                if (book.has_cover) {
                    const buf = readCoverBuffer(book.path);
                    if (buf) {
                        const thumbhash = await generateThumbHash(buf);
                        const imageUrl = await uploadCover(userId, bookId, buf, 'jpg');
                        await withUser(userId, (tx) =>
                            tx.update(books)
                                .set({ image_url: imageUrl, thumbhash })
                                .where(eq(books.id, bookId)));
                    }
                }

                importados++;
                console.log(`✅ [${importados}] ${book.title}`);
            } else {
                ignorados++;
                console.log(`⏭️  Ignorado (já existe): ${book.title}`);
            }
        } catch (error) {
            erros++;
            console.error(`❌ Erro em "${book.title}":`, error);
        }
    }

    calibre.close();

    console.log('\n─────────────────────────────────');
    console.log(`✅ Importados:  ${importados}`);
    console.log(`⏭️  Ignorados:   ${ignorados}`);
    console.log(`❌ Erros:       ${erros}`);
    console.log(`📚 Total:       ${calibreBooks.length}`);
    console.log('─────────────────────────────────');
}

// Executa somente quando rodado diretamente (`tsx lib/db/import-calibre.ts`),
// nunca quando o módulo é importado (ex.: pelos testes, para reusar
// `resolveUserId`). `client.end()` roda sempre, sucesso ou erro — sem isso o
// pool `postgres-js` fica pendurado ~20s (idle_timeout) até o processo
// encerrar sozinho.
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