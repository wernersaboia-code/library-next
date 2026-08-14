// lib/db/import-calibre.ts
// Carrega o .env antes de `./drizzle` (que lê POSTGRES_URL no import).
// Como efeito de import, roda na ordem dos imports — diferente de um
// `dotenv.config()` statement, que rodaria depois de todos os imports.
import 'dotenv/config';
import path from 'path';
import sharp from 'sharp';
import * as ThumbHash from 'thumbhash';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { client, db } from './drizzle';
import { books, authors, bookToAuthor, appUsers } from './schema';
import { withUser } from './with-user';
import {
    decideSync,
    metadataValues,
    type CalibreBookInput,
    type CatalogMetadata,
    type ExistingBook,
} from './calibre-sync';
import { readCalibreLibrary, readCoverBuffer } from './calibre-reader';
// `uploadCover` vive em um módulo marcado com `import 'server-only'`
// (proteção contra bundle de cliente no Next.js). Fora do Next, esse pacote
// lança incondicionalmente ao ser importado — por isso `pnpm
// db:import-calibre` roda com `tsx --conditions=react-server`, que faz o
// Node resolver `server-only` para o stub vazio em vez do throw.
import { authorId } from '@/lib/authors';
import { uploadCover } from '@/lib/storage';

// A leitura do Calibre é reexportada daqui: quem consome o sync importa as
// duas metades do mesmo módulo.
export { readCalibreLibrary } from './calibre-reader';

// ─── Configuração ─────────────────────────────────────────────
// Caminho da biblioteca Calibre: --path=... na linha de comando, ou a env
// CALIBRE_PATH, ou o default. Ex.: pnpm db:import-calibre --email=... --path="G:\Meu Drive\Livros"
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

// ─── Resumo do sync ───────────────────────────────────────────
export interface SyncSummary {
    novos: number;
    atualizados: number;
    pulados: number;
    naoPossuidos: number;
    erros: number;
}

/**
 * Metadado de catálogo sem o watermark `calibre_modified`. Usado na escrita
 * inicial (insert/update) do livro: o watermark só avança depois que a capa
 * for resolvida com sucesso (ver `syncCover` e o chamador em
 * `syncCalibreBooks`) — assim, uma capa que falha faz o próximo run
 * reprocessar o livro em vez de ficar sem capa para sempre.
 */
type CatalogWithoutWatermark = Omit<CatalogMetadata, 'calibre_modified'>;

function semWatermark(meta: CatalogMetadata): CatalogWithoutWatermark {
    const {
        title, title_source, isbn, isbn13, publication_year, publisher,
        series, series_index, language_code, description, genre, num_pages,
        average_rating,
    } = meta;
    return {
        title, title_source, isbn, isbn13, publication_year, publisher,
        series, series_index, language_code, description, genre, num_pages,
        average_rating,
    };
}

/** Garante as linhas de `authors` (tabela global, sem RLS) e devolve os ids. */
async function ensureAuthors(nomes: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const nome of nomes) {
        const id = authorId(nome);
        await db.insert(authors).values({ id, name: nome }).onConflictDoNothing();
        ids.push(id);
    }
    return ids;
}

/**
 * Sobe a capa do livro e grava `image_url`/`thumbhash`. Falha de leitura,
 * de imagem ou de Storage vira aviso e segue: o livro já está persistido, e
 * uma capa ausente não pode derrubar o sync inteiro.
 *
 * Devolve `true` quando não há nada pendente (sem capa, ou capa subiu com
 * sucesso) e `false` quando a capa deveria existir mas não pôde ser
 * sincronizada — o chamador usa esse booleano para decidir se o watermark
 * `calibre_modified` pode avançar (ver `syncCalibreBooks`).
 */
async function syncCover(
    userId: string,
    bookId: number,
    livro: CalibreBookInput,
    calibrePath: string
): Promise<boolean> {
    if (!livro.hasCover) return true;
    try {
        const buf = readCoverBuffer(calibrePath, livro.path);
        if (!buf) {
            console.warn('[sync] capa ausente no disco', {
                uuid: livro.uuid,
                titulo: livro.title,
                caminho: path.join(calibrePath, livro.path, 'cover.jpg'),
            });
            return false;
        }

        const hash = createHash('sha256').update(buf).digest('hex');
        const [atual] = await withUser(userId, (tx) =>
            tx
                .select({
                    cover_hash: books.cover_hash,
                    image_url: books.image_url,
                })
                .from(books)
                .where(eq(books.id, bookId))
                .limit(1)
        );

        // Capa byte a byte idêntica à que já está no Storage: não há o que
        // enviar. Editar metadados em lote no Calibre marca centenas de
        // livros como modificados sem tocar nas capas — sem esta guarda,
        // cada um desses custava um upload inútil.
        if (atual?.cover_hash === hash && atual.image_url) return true;

        const thumbhash = await generateThumbHash(buf);
        const imageUrl = await uploadCover(userId, bookId, buf, 'jpg');
        await withUser(userId, (tx) =>
            tx
                .update(books)
                .set({ image_url: imageUrl, thumbhash, cover_hash: hash })
                .where(and(eq(books.id, bookId), eq(books.source, 'calibre')))
        );
        return true;
    } catch (error) {
        console.warn('[sync] falha ao sincronizar capa', {
            uuid: livro.uuid,
            titulo: livro.title,
            erro: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}

/** Carrega os livros já sincronizados, indexados pelo uuid do Calibre. */
async function loadExisting(userId: string): Promise<Map<string, ExistingBook>> {
    const rows = await withUser(userId, (tx) =>
        tx
            .select({
                id: books.id,
                calibreUuid: books.calibre_uuid,
                calibreModified: books.calibre_modified,
            })
            .from(books)
            .where(eq(books.source, 'calibre'))
    );

    const porUuid = new Map<string, ExistingBook>();
    for (const row of rows) {
        if (row.calibreUuid) {
            porUuid.set(row.calibreUuid, {
                id: row.id,
                calibreModified: row.calibreModified,
            });
        }
    }
    return porUuid;
}

/** Recalcula os vínculos livro↔autor: apaga os antigos e recria os atuais. */
async function syncAuthorLinks(
    tx: Parameters<Parameters<typeof withUser>[1]>[0],
    bookId: number,
    authorIds: string[]
): Promise<void> {
    await tx.delete(bookToAuthor).where(eq(bookToAuthor.bookId, bookId));
    for (const id of authorIds) {
        await tx
            .insert(bookToAuthor)
            .values({ bookId, authorId: id })
            .onConflictDoNothing();
    }
}

/**
 * Reconcilia a posse ao fim do sync: o que veio do Calibre é possuído, o que
 * sumiu de lá vira `owned = false` (nunca apagado — o tracking do usuário
 * sobrevive ao livro sair da biblioteca). Só mexe em `source = 'calibre'`;
 * livros manuais são invioláveis aqui.
 */
async function reconcileOwnership(
    userId: string,
    uuids: string[]
): Promise<number> {
    return withUser(userId, async (tx) => {
        // Lista vazia = biblioteca vazia: TODO livro do Calibre deixa de ser
        // possuído. `notInArray` com lista vazia é tratado à parte porque um
        // `not in ()` degenerado não expressa isso em Postgres.
        const ausentes =
            uuids.length === 0
                ? and(eq(books.source, 'calibre'), eq(books.owned, true))
                : and(
                      eq(books.source, 'calibre'),
                      eq(books.owned, true),
                      notInArray(books.calibre_uuid, uuids)
                  );

        const desmarcados = await tx
            .update(books)
            .set({ owned: false })
            .where(ausentes)
            .returning({ id: books.id });

        // Espelho: um livro que voltou para a biblioteca volta a ser possuído.
        if (uuids.length > 0) {
            await tx
                .update(books)
                .set({ owned: true })
                .where(
                    and(
                        eq(books.source, 'calibre'),
                        eq(books.owned, false),
                        inArray(books.calibre_uuid, uuids)
                    )
                );
        }

        return desmarcados.length;
    });
}

/**
 * Escreve no banco. Recebe os livros já lidos — é o que permite testar o
 * sync sem um metadata.db real. `calibrePath` serve só para localizar as
 * capas no disco (`{calibrePath}/{bookPath}/cover.jpg`).
 *
 * Idempotente: rodar duas vezes com a mesma biblioteca não duplica nada e,
 * quando o metadado muda, atualiza SÓ metadado — o tracking do usuário
 * (status de leitura, avaliação, datas, notas) nunca é tocado.
 */
export async function syncCalibreBooks(
    userId: string,
    livros: CalibreBookInput[],
    calibrePath: string
): Promise<SyncSummary> {
    const resumo: SyncSummary = {
        novos: 0,
        atualizados: 0,
        pulados: 0,
        naoPossuidos: 0,
        erros: 0,
    };

    const existentes = await loadExisting(userId);

    for (const livro of livros) {
        // Isolamento por livro: um problemático não aborta os demais.
        try {
            const decisao = decideSync(livro, existentes.get(livro.uuid));

            if (decisao.kind === 'skip') {
                resumo.pulados++;
                continue;
            }

            const authorIds = await ensureAuthors(livro.authors);

            const bookId = await withUser(userId, async (tx) => {
                if (decisao.kind === 'insert') {
                    // `calibre_modified` fica de fora aqui de propósito: só é
                    // gravado depois que a capa for resolvida (abaixo), para
                    // que uma capa que falhe force reprocessamento no
                    // próximo run em vez de ficar sem capa para sempre.
                    const [inserted] = await tx
                        .insert(books)
                        .values({
                            ...semWatermark(metadataValues(livro)),
                            userId,
                            calibre_uuid: livro.uuid,
                            source: 'calibre',
                            owned: true,
                            read_status: 'não lido',
                        })
                        .returning({ id: books.id });
                    await syncAuthorLinks(tx, inserted.id, authorIds);
                    return inserted.id;
                }

                // O `set` é literalmente o retorno de `metadataValues` (sem o
                // watermark): nada é acrescentado, então nenhum campo de
                // tracking ou de posse pode escapar para o UPDATE.
                await tx
                    .update(books)
                    .set(semWatermark(metadataValues(livro)))
                    .where(
                        and(
                            eq(books.id, decisao.bookId),
                            eq(books.source, 'calibre')
                        )
                    );
                await syncAuthorLinks(tx, decisao.bookId, authorIds);
                return decisao.bookId;
            });

            const capaOk = await syncCover(userId, bookId, livro, calibrePath);
            if (capaOk) {
                // Watermark só avança quando a capa está resolvida (ou não
                // havia capa a resolver) — é o que garante que uma capa que
                // falhar seja reprocessada no próximo run, e não perdida.
                await withUser(userId, (tx) =>
                    tx
                        .update(books)
                        .set({ calibre_modified: livro.lastModified })
                        .where(
                            and(eq(books.id, bookId), eq(books.source, 'calibre'))
                        )
                );
            }

            if (decisao.kind === 'insert') {
                resumo.novos++;
                existentes.set(livro.uuid, {
                    id: bookId,
                    calibreModified: livro.lastModified,
                });
            } else {
                resumo.atualizados++;
            }
        } catch (error) {
            resumo.erros++;
            console.error(`❌ Erro em "${livro.title}" (${livro.uuid}):`, error);
        }
    }

    resumo.naoPossuidos = await reconcileOwnership(
        userId,
        livros.map((l) => l.uuid)
    );

    // Logo após um `db:migrate` (que zera `books`) seguido do import, o
    // planner ainda não tem estatísticas de `books` — `estimateTotalBooks`
    // (lib/db/queries.ts) usa `EXPLAIN` para estimar o total do catálogo, e
    // sem `ANALYZE` essa estimativa fica muito abaixo do real (ex.: ~130 em
    // vez de 1318). Roda fora de transação/`withUser`: `ANALYZE` não se
    // beneficia de `set_local` e não deve competir com o commit dos dados.
    // Falha aqui não pode derrubar o sync — os dados já estão gravados — por
    // isso fica isolado em try/catch com apenas um aviso.
    try {
        await client`analyze books`;
    } catch (error) {
        console.warn('[sync] falha ao executar ANALYZE em books', {
            erro: error instanceof Error ? error.message : String(error),
        });
    }

    return resumo;
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
    console.log('📚 Iniciando sync do Calibre...\n');

    const calibrePath = calibrePathFromArgs();
    const email = argValue('--email=') ?? '';
    const userId = await resolveUserId(email);

    const livros = await readCalibreLibrary(calibrePath);
    console.log(`📖 ${livros.length} livros encontrados no Calibre\n`);

    // Guarda-corpo: uma lista vazia faz `syncCalibreBooks` marcar TODOS os
    // livros `source='calibre'` como não possuídos (comportamento
    // intencional da função — ver `reconcileOwnership` — e coberto por
    // testes). Aqui em `main()`, que roda direto na mão do usuário, uma
    // lista vazia é muito mais provável de ser um caminho errado do que uma
    // biblioteca esvaziada de propósito — por isso aborta a menos que
    // `--permitir-vazio` seja passado explicitamente.
    if (livros.length === 0 && argValue('--permitir-vazio') === undefined) {
        console.error(
            '⚠️  Nenhum livro encontrado no caminho informado ' +
                `("${calibrePath}").\n` +
                'Continuar assim marcaria TODOS os livros já sincronizados ' +
                'do Calibre como não possuídos (owned=false).\n' +
                'Verifique o caminho (--path=... ou CALIBRE_PATH). Se a ' +
                'intenção é mesmo esvaziar a biblioteca, rode de novo com ' +
                '--permitir-vazio.'
        );
        process.exitCode = 1;
        return;
    }

    const resumo = await syncCalibreBooks(userId, livros, calibrePath);

    console.log('\n─────────────────────────────────');
    console.log(`🆕 Novos:         ${resumo.novos}`);
    console.log(`♻️  Atualizados:   ${resumo.atualizados}`);
    console.log(`⏭️  Pulados:       ${resumo.pulados}`);
    console.log(`📦 Não possuídos: ${resumo.naoPossuidos}`);
    console.log(`❌ Erros:         ${resumo.erros}`);
    console.log(`📚 Total:         ${livros.length}`);
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
