// lib/db/import-calibre.ts
import initSqlJs from 'sql.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import * as ThumbHash from 'thumbhash';
import { db } from './drizzle';
import { books, authors, bookToAuthor } from './schema';

dotenv.config();

// ─── Configuração ─────────────────────────────────────────────
const CALIBRE_PATH = 'C:\\Livros\\Calibre Portable\\Calibre Library';
const CALIBRE_DB   = path.join(CALIBRE_PATH, 'metadata.db');

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
async function getCoverData(
    bookPath: string
): Promise<{ image_url: string | null; thumbhash: string | null }> {
    try {
        const coverPath = path.join(CALIBRE_PATH, bookPath, 'cover.jpg');
        if (!fs.existsSync(coverPath)) return { image_url: null, thumbhash: null };

        const imageBuffer = fs.readFileSync(coverPath);
        const thumbhash   = await generateThumbHash(imageBuffer);

        return { image_url: coverPath, thumbhash };
    } catch {
        return { image_url: null, thumbhash: null };
    }
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

            // ── Capa ──────────────────────────────────────────────
            const { image_url, thumbhash } = book.has_cover
                ? await getCoverData(book.path)
                : { image_url: null, thumbhash: null };

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

            // ── Inserir autores ───────────────────────────────────
            const authorIds: string[] = [];

            for (const a of calibreAuthors) {
                const authorId = a.name
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-]/g, '')
                    .slice(0, 50) || 'desconhecido';

                await db
                    .insert(authors)
                    .values({ id: authorId, name: a.name })
                    .onConflictDoNothing();

                authorIds.push(authorId);
            }

            // ── Inserir livro ─────────────────────────────────────
            const inserted = await db
                .insert(books)
                .values({
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
                    image_url,
                    thumbhash,
                    title_tsv: book.title,
                })
                .onConflictDoNothing()
                .returning({ id: books.id });

            // ── Inserir relação livro↔autor ───────────────────────
            if (inserted.length > 0) {
                const bookId = inserted[0].id;

                for (const authorId of authorIds) {
                    await db
                        .insert(bookToAuthor)
                        .values({ bookId, authorId })
                        .onConflictDoNothing();
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

main().catch(console.error);