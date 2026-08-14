import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createTestDb } from '../helpers/db';
import type { CalibreBookInput } from '@/lib/db/calibre-sync';

vi.mock('@/lib/storage', () => ({
  uploadCover: vi.fn(async () => 'https://cdn/c.jpg'),
  StorageQuotaError: class extends Error {},
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  const [u] = await ctx.sql`insert into app_users (email) values ('sy@x.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

function livro(over: Partial<CalibreBookInput> = {}): CalibreBookInput {
  return {
    uuid: 'u-1', lastModified: 'T1', title: 'Original', authors: ['Autor A'],
    publicationYear: 2020, publisher: null, series: null, seriesIndex: null,
    languageCode: 'pt',
    description: null, genre: 'Terror', numPages: 100, averageRating: null,
    isbn: null, isbn13: null, hasCover: false, path: 'Autor A/Original (1)', ...over,
  };
}

describe('série e volume', () => {
  it('grava o nome da série e o número do volume em colunas separadas', async () => {
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');
    await syncCalibreBooks(userId, [
      livro({ uuid: 'u-serie', title: 'Hyperion', series: 'Hyperion Cantos', seriesIndex: 2 }),
    ], '');
    const [b] = await ctx.sql`
      select series, series_index from books where calibre_uuid = 'u-serie'`;
    expect(b.series).toBe('Hyperion Cantos');
    expect(Number(b.series_index)).toBe(2);
  });

  it('volumes da mesma série compartilham o mesmo nome', async () => {
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');
    await syncCalibreBooks(userId, [
      livro({ uuid: 'u-v1', title: 'V1', series: 'Ilium', seriesIndex: 1 }),
      livro({ uuid: 'u-v2', title: 'V2', series: 'Ilium', seriesIndex: 2 }),
    ], '');
    const rows = await ctx.sql`
      select count(*)::int as n from books where series = 'Ilium'`;
    expect(rows[0].n).toBe(2);
  });

  it('livro sem série fica com as duas colunas nulas', async () => {
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');
    await syncCalibreBooks(userId, [
      livro({ uuid: 'u-sem-serie', title: 'Avulso', series: null, seriesIndex: null }),
    ], '');
    const [b] = await ctx.sql`
      select series, series_index from books where calibre_uuid = 'u-sem-serie'`;
    expect(b.series).toBeNull();
    expect(b.series_index).toBeNull();
  });
});

describe('sync do Calibre', () => {
  it('rodar duas vezes não duplica — a idempotência', async () => {
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');
    await syncCalibreBooks(userId, [livro()], '');
    await syncCalibreBooks(userId, [livro()], '');
    const rows = await ctx.sql`select id from books where calibre_uuid = 'u-1'`;
    expect(rows).toHaveLength(1);
  });

  it('preserva tracking ao atualizar metadados', async () => {
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');
    await syncCalibreBooks(userId, [livro({ uuid: 'u-2' })], '');
    const [b] = await ctx.sql`select id from books where calibre_uuid = 'u-2'`;
    await ctx.sql`
      update books set read_status = 'lido', my_rating = 5,
        date_finished = '2026-01-01' where id = ${b.id}`;
    await ctx.sql`insert into highlights (user_id, book_id, kind, note)
      values (${userId}, ${b.id}, 'note', 'minha nota')`;

    await syncCalibreBooks(
      userId, [livro({ uuid: 'u-2', title: 'Título Novo', lastModified: 'T2' })], ''
    );

    const [d] = await ctx.sql`
      select title, read_status, my_rating, date_finished from books where id = ${b.id}`;
    expect(d.title).toBe('Título Novo');       // metadado atualizou
    expect(d.read_status).toBe('lido');        // tracking intacto
    expect(Number(d.my_rating)).toBe(5);
    expect(d.date_finished).not.toBeNull();
    const notas = await ctx.sql`select id from highlights where book_id = ${b.id}`;
    expect(notas).toHaveLength(1);
  });

  it('marca owned=false quando o livro some do Calibre, sem apagar', async () => {
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');
    await syncCalibreBooks(userId, [livro({ uuid: 'u-3' })], '');
    await syncCalibreBooks(userId, [], '');    // biblioteca vazia
    const [b] = await ctx.sql`select owned from books where calibre_uuid = 'u-3'`;
    expect(b.owned).toBe(false);
  });

  it('nunca toca livros manuais', async () => {
    const [m] = await ctx.sql`
      insert into books (user_id, title, title_source, source, owned)
      values (${userId}, 'Manual', 'Manual', 'manual', false) returning id`;
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');
    await syncCalibreBooks(userId, [], '');
    const [d] = await ctx.sql`select title, owned from books where id = ${m.id}`;
    expect(d.title).toBe('Manual');
    expect(d.owned).toBe(false);   // continua false, não virou true nem sumiu
  });

  it('pula livro inalterado sem re-subir capa', async () => {
    // Capa real no disco (conteúdo não precisa ser um JPEG válido: só o
    // fs.existsSync/readFileSync importam aqui) para que syncCover tenha
    // sucesso e o watermark avance no primeiro sync.
    const calibrePath = fs.mkdtempSync(path.join(os.tmpdir(), 'calibre-'));
    const bookDir = path.join(calibrePath, 'Autor A', 'Original (1)');
    fs.mkdirSync(bookDir, { recursive: true });
    fs.writeFileSync(path.join(bookDir, 'cover.jpg'), Buffer.from('fake-cover'));

    const { uploadCover } = await import('@/lib/storage');
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');
    await syncCalibreBooks(userId, [livro({ uuid: 'u-4', hasCover: true })], calibrePath);
    vi.mocked(uploadCover).mockClear();
    const r = await syncCalibreBooks(
      userId, [livro({ uuid: 'u-4', hasCover: true })], calibrePath
    );
    expect(uploadCover).not.toHaveBeenCalled();
    expect(r.pulados).toBe(1);
  });

  it('livro do Calibre que reaparece volta a owned=true, sem tocar em manual', async () => {
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');

    // u-5 entra, depois some da biblioteca -> owned=false.
    await syncCalibreBooks(userId, [livro({ uuid: 'u-5' })], '');
    await syncCalibreBooks(userId, [], '');
    const [antes] = await ctx.sql`select owned from books where calibre_uuid = 'u-5'`;
    expect(antes.owned).toBe(false);

    const [manual] = await ctx.sql`
      insert into books (user_id, title, title_source, source, owned)
      values (${userId}, 'Manual owned=false', 'Manual owned=false', 'manual', false)
      returning id`;

    // u-5 volta a aparecer na biblioteca.
    await syncCalibreBooks(userId, [livro({ uuid: 'u-5' })], '');

    const [depois] = await ctx.sql`select owned from books where calibre_uuid = 'u-5'`;
    expect(depois.owned).toBe(true);

    const [manualDepois] = await ctx.sql`select owned from books where id = ${manual.id}`;
    expect(manualDepois.owned).toBe(false); // ramo de owned=true não atinge manuais
  });

  it('metadado alterado com a MESMA capa não reenvia a imagem', async () => {
    // O caso real: uma edição em lote no Calibre tocou 453 livros, e o sync
    // reenviou 453 capas idênticas ao Storage.
    const calibrePath = fs.mkdtempSync(path.join(os.tmpdir(), 'calibre-'));
    const bookDir = path.join(calibrePath, 'Autor A', 'Original (1)');
    fs.mkdirSync(bookDir, { recursive: true });
    fs.writeFileSync(path.join(bookDir, 'cover.jpg'), Buffer.from('capa-identica'));

    const { uploadCover } = await import('@/lib/storage');
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');

    await syncCalibreBooks(
      userId,
      [livro({ uuid: 'u-hash', hasCover: true, lastModified: 'T1' })],
      calibrePath
    );
    vi.mocked(uploadCover).mockClear();

    const r = await syncCalibreBooks(
      userId,
      [livro({
        uuid: 'u-hash', hasCover: true, lastModified: 'T2',
        title: 'Título Corrigido',
      })],
      calibrePath
    );

    expect(r.atualizados).toBe(1);
    expect(uploadCover).not.toHaveBeenCalled();

    const [b] = await ctx.sql`
      select title, image_url from books where calibre_uuid = 'u-hash'`;
    expect(b.title).toBe('Título Corrigido');   // o metadado foi atualizado
    expect(b.image_url).toBe('https://cdn/c.jpg'); // e a capa continua lá
  });

  it('capa trocada no Calibre É reenviada', async () => {
    const calibrePath = fs.mkdtempSync(path.join(os.tmpdir(), 'calibre-'));
    const bookDir = path.join(calibrePath, 'Autor A', 'Original (1)');
    fs.mkdirSync(bookDir, { recursive: true });
    const capa = path.join(bookDir, 'cover.jpg');
    fs.writeFileSync(capa, Buffer.from('capa-antiga'));

    const { uploadCover } = await import('@/lib/storage');
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');

    await syncCalibreBooks(
      userId,
      [livro({ uuid: 'u-capa-nova', hasCover: true, lastModified: 'T1' })],
      calibrePath
    );
    vi.mocked(uploadCover).mockClear();

    fs.writeFileSync(capa, Buffer.from('capa-completamente-diferente'));
    await syncCalibreBooks(
      userId,
      [livro({ uuid: 'u-capa-nova', hasCover: true, lastModified: 'T2' })],
      calibrePath
    );

    expect(uploadCover).toHaveBeenCalledTimes(1);
  });

  it('capa que falha não avança o watermark — próximo run reprocessa', async () => {
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');

    // calibrePath='' garante que o arquivo de capa não existe no disco,
    // então syncCover falha (sem cover.jpg) e não deve gravar calibre_modified.
    const r1 = await syncCalibreBooks(
      userId, [livro({ uuid: 'u-6', hasCover: true })], ''
    );
    expect(r1.novos).toBe(1);

    const [b] = await ctx.sql`
      select calibre_modified from books where calibre_uuid = 'u-6'`;
    expect(b.calibre_modified).toBeNull();

    // Próximo run: como o watermark não avançou, o livro é reprocessado
    // (não é `skip`).
    const r2 = await syncCalibreBooks(
      userId, [livro({ uuid: 'u-6', hasCover: true })], ''
    );
    expect(r2.pulados).toBe(0);
    expect(r2.atualizados).toBe(1);
  });
});
