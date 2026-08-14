// lib/db/calibre-reader.ts
// Leitura da biblioteca Calibre: só I/O de arquivo (metadata.db + capas).
// Não importa nada de banco nem de Storage — é o que permite testar o sync
// sem um metadata.db real, e ler um metadata.db sem tocar no Postgres.
import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import type { CalibreBookInput } from './calibre-sync';

// ─── Helpers de query no SQLite ───────────────────────────────
function query<T>(
    db: import('sql.js').Database,
    sql: string,
    params: (string | number | null)[] = []
): T[] {
    const stmt = db.prepare(sql);
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
    return query<T>(db, sql, params)[0];
}

// ─── Tipos das linhas do Calibre ──────────────────────────────
interface CalibreBookRow {
    id: number;
    uuid: string | null;
    title: string;
    pubdate: string | null;
    series_index: number | null;
    path: string;
    has_cover: number;
    last_modified: string | null;
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

/** Caminho do metadata.db dentro de uma biblioteca Calibre. */
export function calibreDbPath(calibrePath: string): string {
    return path.join(calibrePath, 'metadata.db');
}

/** Lê o buffer de `cover.jpg` do livro, se existir no disco. */
export function readCoverBuffer(
    calibrePath: string,
    bookPath: string
): Buffer | null {
    const coverPath = path.join(calibrePath, bookPath, 'cover.jpg');
    if (!fs.existsSync(coverPath)) return null;
    return fs.readFileSync(coverPath);
}

/**
 * Lê o `metadata.db` do Calibre e devolve os livros já normalizados.
 * Faz I/O de arquivo; não toca no banco.
 *
 * Livros sem `uuid` são ignorados: sem identidade estável não há como
 * sincronizar de forma idempotente (viraria duplicata a cada execução).
 */
export async function readCalibreLibrary(
    calibrePath: string
): Promise<CalibreBookInput[]> {
    const dbFile = calibreDbPath(calibrePath);
    if (!fs.existsSync(dbFile)) {
        throw new Error(`metadata.db não encontrado em: ${dbFile}`);
    }

    const SQL = await initSqlJs();
    const calibre = new SQL.Database(fs.readFileSync(dbFile));

    try {
        const rows = query<CalibreBookRow>(
            calibre,
            `SELECT id, uuid, title, pubdate, series_index, path, has_cover,
                    last_modified
             FROM books ORDER BY id`
        );

        const livros: CalibreBookInput[] = [];
        const semUuid: string[] = [];

        for (const book of rows) {
            if (!book.uuid) {
                semUuid.push(book.title);
                continue;
            }

            const autores = query<CalibreAuthor>(
                calibre,
                `SELECT a.name
                 FROM authors a
                 JOIN books_authors_link bal ON bal.author = a.id
                 WHERE bal.book = ?`,
                [book.id]
            );

            const tags = query<CalibreTag>(
                calibre,
                `SELECT t.name
                 FROM tags t
                 JOIN books_tags_link btl ON btl.tag = t.id
                 WHERE btl.book = ?
                 ORDER BY t.name`,
                [book.id]
            );

            const seriesRow = queryOne<CalibreSeries>(
                calibre,
                `SELECT s.name
                 FROM series s
                 JOIN books_series_link bsl ON bsl.series = s.id
                 WHERE bsl.book = ?
                 LIMIT 1`,
                [book.id]
            );

            const publisherRow = queryOne<CalibrePublisher>(
                calibre,
                `SELECT p.name
                 FROM publishers p
                 JOIN books_publishers_link bpl ON bpl.publisher = p.id
                 WHERE bpl.book = ?
                 LIMIT 1`,
                [book.id]
            );

            const langRow = queryOne<CalibreLanguage>(
                calibre,
                `SELECT l.lang_code
                 FROM languages l
                 JOIN books_languages_link bll ON bll.lang_code = l.id
                 WHERE bll.book = ?
                 LIMIT 1`,
                [book.id]
            );

            // Avaliação: 0-10 no Calibre → 0-5 aqui.
            const ratingRow = queryOne<CalibreRating>(
                calibre,
                `SELECT r.rating
                 FROM ratings r
                 JOIN books_ratings_link brl ON brl.rating = r.id
                 WHERE brl.book = ?
                 LIMIT 1`,
                [book.id]
            );

            const commentRow = queryOne<CalibreComment>(
                calibre,
                'SELECT text FROM comments WHERE book = ? LIMIT 1',
                [book.id]
            );

            const pagesRow = queryOne<CalibrePages>(
                calibre,
                'SELECT pages FROM books_pages_link WHERE book = ? LIMIT 1',
                [book.id]
            );

            const identifiers = query<CalibreIdentifier>(
                calibre,
                'SELECT type, val FROM identifiers WHERE book = ?',
                [book.id]
            );

            const pubYear = book.pubdate
                ? new Date(book.pubdate).getFullYear()
                : null;

            livros.push({
                uuid: book.uuid,
                lastModified: book.last_modified ?? '',
                title: book.title,
                authors: autores.map((a) => a.name),
                publicationYear: pubYear && pubYear > 1000 ? pubYear : null,
                publisher: publisherRow?.name ?? null,
                // Nome e volume vão em colunas separadas: concatenar os dois
                // fazia cada volume virar uma série diferente no agrupamento.
                series: seriesRow?.name ?? null,
                seriesIndex: seriesRow ? book.series_index ?? null : null,
                languageCode: langRow?.lang_code ?? null,
                description: commentRow?.text ?? null,
                genre: tags.length > 0 ? tags[0].name : null,
                numPages: pagesRow?.pages ?? null,
                averageRating: ratingRow
                    ? String((ratingRow.rating / 2).toFixed(2))
                    : null,
                isbn: identifiers.find((i) => i.type === 'isbn')?.val ?? null,
                isbn13: identifiers.find((i) => i.type === 'isbn13')?.val ?? null,
                hasCover: Boolean(book.has_cover),
                path: book.path,
            });
        }

        if (semUuid.length > 0) {
            const titulos = semUuid.slice(0, 10);
            const resto = semUuid.length > titulos.length
                ? ` (+${semUuid.length - titulos.length})`
                : '';
            console.warn(
                `[calibre] ${semUuid.length} livro(s) sem uuid ignorado(s)`,
                titulos,
                resto
            );
        }

        return livros;
    } finally {
        calibre.close();
    }
}
