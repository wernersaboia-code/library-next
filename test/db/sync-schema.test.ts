import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const [u] = await ctx.sql`insert into app_users (email) values ('s@x.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

describe('schema de sync e posse', () => {
  it('tem defaults compatíveis com o acervo existente', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${userId}, 'L', 'L') returning source, owned`;
    expect(b.source).toBe('calibre');
    expect(b.owned).toBe(true);
  });

  it('recusa source fora de calibre/manual', async () => {
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, source)
      values (${userId}, 'X', 'X', 'kobo')`).rejects.toThrow(/check/i);
  });

  it('impede dois livros com o mesmo calibre_uuid para o mesmo usuário', async () => {
    await ctx.sql`
      insert into books (user_id, title, title_source, calibre_uuid)
      values (${userId}, 'A', 'A', 'uuid-1')`;
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, calibre_uuid)
      values (${userId}, 'B', 'B', 'uuid-1')`).rejects.toThrow(/duplicate key|unique/i);
  });

  it('permite vários livros manuais (calibre_uuid nulo)', async () => {
    await ctx.sql`
      insert into books (user_id, title, title_source, source, owned)
      values (${userId}, 'M1', 'M1', 'manual', false)`;
    await ctx.sql`
      insert into books (user_id, title, title_source, source, owned)
      values (${userId}, 'M2', 'M2', 'manual', false)`;
    const rows = await ctx.sql`
      select id from books where source = 'manual'`;
    expect(rows).toHaveLength(2);
  });

  it('o índice de calibre_uuid é parcial (só vale quando uuid não é nulo)', async () => {
    const [idx] = await ctx.sql`
      select indexdef from pg_indexes
      where indexname = 'books_user_calibre_uuid_unique'
        and schemaname = current_schema()`;
    expect(idx).toBeDefined();
    if (!idx) return;
    expect(String(idx.indexdef)).toMatch(/unique/i);
    expect(String(idx.indexdef)).toMatch(/where .*calibre_uuid.*is not null/i);
  });
});

describe('o sync não escreve dados de leitura', () => {
  it('metadataValues não devolve next_up nem favorite', async () => {
    const { metadataValues } = await import('@/lib/db/calibre-sync');
    const chaves = Object.keys(metadataValues({
      uuid: 'u', lastModified: '2026-01-01', title: 'T', authors: [],
      publicationYear: null, publisher: null, series: null, seriesIndex: null,
      languageCode: null, description: null, genre: null, numPages: null,
      averageRating: null, isbn: null, isbn13: null, hasCover: false, path: 'T',
    }));

    expect(chaves).not.toContain('next_up');
    expect(chaves).not.toContain('favorite');
    expect(chaves).not.toContain('my_rating');
    expect(chaves).not.toContain('read_status');
  });
});
