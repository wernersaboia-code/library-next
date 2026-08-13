import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
    publicationYear: 2020, publisher: null, series: null, languageCode: 'pt',
    description: null, genre: 'Terror', numPages: 100, averageRating: null,
    isbn: null, isbn13: null, hasCover: false, path: 'Autor A/Original (1)', ...over,
  };
}

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
    const { uploadCover } = await import('@/lib/storage');
    const { syncCalibreBooks } = await import('@/lib/db/import-calibre');
    await syncCalibreBooks(userId, [livro({ uuid: 'u-4', hasCover: true })], '');
    vi.mocked(uploadCover).mockClear();
    const r = await syncCalibreBooks(userId, [livro({ uuid: 'u-4', hasCover: true })], '');
    expect(uploadCover).not.toHaveBeenCalled();
    expect(r.pulados).toBe(1);
  });
});
