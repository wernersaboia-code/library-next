import {
  describe, it, expect, beforeAll, afterAll, afterEach, vi,
} from 'vitest';
import { readFileSync } from 'fs';
import { createTestDb } from '../helpers/db';
import { importBook, type ImportParams } from '@/lib/import-book';

// O `importBook` (e o `withUser` que ele usa) fala com o singleton `db` de
// `@/lib/db/drizzle`, que em produção aponta para o schema `public`. Cada
// suíte de teste roda num schema `test_*` isolado (ver test/helpers/db.ts),
// então redirecionamos esse singleton para a conexão da suíte via getter —
// resolvido preguiçosamente, já que `ctx` só existe depois do beforeAll.
const dbHolder: { db: unknown } = { db: undefined };
vi.mock('@/lib/db/drizzle', () => ({
  get db() {
    return dbHolder.db;
  },
}));

// Storage é mockado: os testes não sobem nada de verdade. O import só depende
// da URL devolvida (capa) e de o upload não lançar (cache).
vi.mock('@/lib/storage', () => ({
  uploadCover: vi.fn(async () => 'https://cdn/cover.jpg'),
  uploadBookFile: vi.fn(async () => 'u/1/book.epub'),
  StorageQuotaError: class extends Error {},
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  dbHolder.db = ctx.db;
  const [u] = await ctx.sql`
    insert into app_users (email) values ('i@x.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

/** Stuba o fetch do Drive para devolver a fixture pedida. */
function stubDrive(fixture: string) {
  const buf = readFileSync(`test/fixtures/${fixture}`);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(buf, { status: 200 })));
}

function params(over: Partial<ImportParams> = {}): ImportParams {
  return {
    userId,
    accessToken: 'tok',
    fileId: `file-${Math.random()}`,
    fileName: 'livro.epub',
    mimeType: 'application/epub+zip',
    ...over,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('importBook — EPUB', () => {
  it('importa livro com dois autores e cria os dois vínculos', async () => {
    stubDrive('valido.epub');
    const r = await importBook(params());

    expect(r.title).toBe('O Livro de Teste');
    const links = await ctx.sql`
      select author_id from book_to_author where book_id = ${r.bookId}`;
    expect(links).toHaveLength(2);
    const nomes = await ctx.sql`select name from authors order by name`;
    expect(nomes.map((a) => a.name)).toContain('Maria Andrade');
  });

  it('não falha quando o autor já existe — o bug #7', async () => {
    stubDrive('valido.epub');
    const a = await importBook(params({ fileId: 'f-a' }));
    stubDrive('valido.epub');
    const b = await importBook(params({ fileId: 'f-b' }));

    expect(a.bookId).not.toBe(b.bookId);
    const autores = await ctx.sql`
      select id from authors where name = 'Maria Andrade'`;
    expect(autores).toHaveLength(1); // reaproveitado, não duplicado
  });

  it('cria o vínculo mesmo quando o autor já existia — o bug #7b', async () => {
    stubDrive('valido.epub');
    await importBook(params({ fileId: 'f-c' }));
    stubDrive('valido.epub');
    const segundo = await importBook(params({ fileId: 'f-d' }));

    const links = await ctx.sql`
      select author_id from book_to_author where book_id = ${segundo.bookId}`;
    expect(links).toHaveLength(2); // antes: 0, pulado em silêncio
  });

  it('grava image_url como URL do Storage, nunca base64 — o bug #8', async () => {
    stubDrive('valido.epub');
    const r = await importBook(params({ fileId: 'f-e' }));

    const [book] = await ctx.sql`
      select image_url from books where id = ${r.bookId}`;
    expect(book.image_url).toMatch(/^https:\/\//);
    expect(book.image_url).not.toContain('data=');
    expect(book.image_url).not.toContain('/api/cover');
  });

  it('importa sem capa sem quebrar', async () => {
    stubDrive('sem-capa.epub');
    const r = await importBook(params({ fileId: 'f-f' }));

    const [book] = await ctx.sql`
      select image_url from books where id = ${r.bookId}`;
    expect(book.image_url).toBeNull();
  });

  it('não deixa livro pela metade quando o EPUB é malformado', async () => {
    const antes = await ctx.sql`select count(*)::int as n from books`;
    stubDrive('malformado.epub');

    await expect(importBook(params({ fileId: 'f-g' }))).rejects.toThrow();

    const depois = await ctx.sql`select count(*)::int as n from books`;
    expect(depois[0].n).toBe(antes[0].n);
  });

  it('rejeita reimportação com AlreadyImportedError contendo o bookId', async () => {
    stubDrive('valido.epub');
    const primeiro = await importBook(params({ fileId: 'f-h' }));

    stubDrive('valido.epub');
    await expect(importBook(params({ fileId: 'f-h' })))
      .rejects.toMatchObject({
        name: 'AlreadyImportedError',
        bookId: primeiro.bookId,
      });
  });

  it('não cacheia arquivo acima de DRIVE_CACHE_MAX_BYTES', async () => {
    const { uploadBookFile } = await import('@/lib/storage');
    vi.mocked(uploadBookFile).mockClear();

    stubDrive('valido.epub');
    const r = await importBook(params({
      fileId: 'f-i', sizeBytes: 100 * 1024 * 1024,
    }));

    expect(r.cached).toBe(false);
    expect(uploadBookFile).not.toHaveBeenCalled();
  });

  it('conclui o import mesmo se o Storage falhar (degradação)', async () => {
    // Resolução #1 do controlador: QUALQUER falha de Storage degrada para
    // cached=false; o livro e os metadados sempre persistem.
    const { uploadBookFile, StorageQuotaError } = await import('@/lib/storage');
    vi.mocked(uploadBookFile).mockRejectedValueOnce(new StorageQuotaError());

    stubDrive('valido.epub');
    const r = await importBook(params({ fileId: 'f-j' }));

    expect(r.cached).toBe(false);
    const [book] = await ctx.sql`select id from books where id = ${r.bookId}`;
    expect(book).toBeDefined(); // o livro existe; só não tem cache
  });
});
