# Identidade visual e enriquecimento de desejados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o acervo legível de relance (selo "Lido" e estrelas sobre a capa) e dar à lista de desejados capa, nota dos leitores com número de votos, e espaço para comentário.

**Architecture:** Nenhuma coluna nova — `read_status`/`my_rating`/`image_url`/`thumbhash`/`average_rating`/`ratings_count` já existem em `books`. O componente `Photo` ganha as marcações; um módulo isolado consulta a Open Library (sem chave de API) e devolve candidatos que o usuário escolhe; a capa escolhida é baixada **pelo servidor** e enviada ao Supabase Storage pela mesma função que o upload manual usa.

**Tech Stack:** Next.js 15.5, React 19, TypeScript 5.5 (strict), Drizzle + postgres-js, Supabase Storage, Vitest, ESLint.

## Global Constraints

- **Spec de referência:** `docs/superpowers/specs/2026-08-14-visual-e-desejados-design.md`. Divergência → a spec vence; pare e pergunte.
- **Nenhuma migration.** Todas as colunas necessárias já existem. Se você achar que precisa de uma, pare — releia a spec.
- **Nota nunca sem votos (AD-3).** Onde `average_rating` aparecer, `ratings_count` aparece junto. Sem avaliação → "sem avaliações", nunca campo vazio.
- **Capa só para `source='manual'` (AD-5).** Rotas de capa recusam livro do Calibre com **409**.
- **O cliente nunca envia URL de capa (AD-7).** Manda `coverId` numérico; o **servidor** monta `https://covers.openlibrary.org/b/id/{coverId}-L.jpg`. Aceitar URL do cliente é SSRF.
- **A busca externa nunca bloqueia.** Timeout de 5s; falha → o formulário manual continua utilizável.
- **Todo acesso a dados do usuário passa por `withUser`** (RLS). Nenhum `!` non-null assertion (ESLint `error`, gate bloqueante).
- **PT/inglês:** mensagens de UI e erro em português; código em inglês.
- **`git` neste repo:** exportar antes de qualquer git — `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'`. Nunca `git config --global`.
- **Segredos:** nunca imprimir `.env`/`.env.test`. Testes de banco usam `createTestDb` (isolamento por schema).
- **CI:** `pnpm typecheck` + `pnpm lint` + `pnpm test:run` seguem gates bloqueantes.

---

## File Structure

**Criados**

| Arquivo | Responsabilidade |
|---|---|
| `lib/openlibrary.ts` | Consulta e normalização da Open Library. Sem banco, sem Storage |
| `lib/covers.ts` | `applyCoverFromBuffer` — thumbhash + upload + gravação, compartilhado pelos dois caminhos de capa |
| `app/api/books/search-external/route.ts` | `GET` — devolve candidatos |
| `app/api/books/[id]/cover/route.ts` | `POST` — aplica capa por `coverId` ou por arquivo |
| `components/cover-badges.tsx` | Selo de status e faixa de estrelas (usado dentro do `Photo`) |
| `test/openlibrary.test.ts` | Normalização, limite de 5, timeout |
| `test/api/search-external.test.ts` | Rota de busca |
| `test/api/cover.test.ts` | Rota de capa, incluindo a prova do AD-7 |

**Modificados**

| Arquivo | Mudança |
|---|---|
| `components/photo.tsx` | Aceita `readStatus`/`myRating` e desenha as marcações |
| `lib/db/queries.ts` | `fetchBooksWithPagination` +`read_status`/`my_rating`; `fetchWishlist` +capa/nota |
| `lib/db/schema.ts` | Tipo `Book` acompanha os campos novos |
| `components/grid.tsx` | Repassa os campos novos ao `Photo` |
| `app/api/books/route.ts` | `POST` aceita `averageRating`/`ratingsCount` opcionais |
| `app/(main)/desejados/wishlist-client.tsx` | Busca externa, capa, nota com votos, comentário |
| `app/(main)/[id]/page.tsx` | Repassa os campos novos ao `Photo` |

---

### Task 1: Selo e estrelas sobre a capa

**Files:**
- Create: `components/cover-badges.tsx`
- Modify: `components/photo.tsx`, `lib/db/queries.ts`, `lib/db/schema.ts`, `components/grid.tsx`, `app/(main)/[id]/page.tsx`
- Test: `test/db/cover-fields.test.ts`

**Interfaces:**
- Consumes: colunas existentes `read_status`, `my_rating`
- Produces:
```ts
// components/cover-badges.tsx
export function CoverBadges({
  readStatus, myRating,
}: { readStatus: string | null; myRating: number | null }): React.ReactElement | null;

// components/photo.tsx — props acrescentadas (ambas opcionais)
readStatus?: string | null;
myRating?: number | null;
```

- [ ] **Step 1: Escrever o teste que falha**

`test/db/cover-fields.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  const [u] = await ctx.sql`insert into app_users (email) values ('cf@x.com') returning id`;
  userId = u.id;
  await ctx.sql`
    insert into books (user_id, title, title_source, image_url, read_status, my_rating)
    values (${userId}, 'Lido e Avaliado', 'Lido e Avaliado', 'https://cdn/a.jpg', 'lido', 4)`;
});
afterAll(() => ctx.cleanup());

describe('campos de marcação chegam na listagem', () => {
  it('fetchBooksWithPagination devolve read_status e my_rating', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].read_status).toBe('lido');
    expect(Number(rows[0].my_rating)).toBe(4);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/cover-fields.test.ts`
Expected: FAIL — `read_status` não existe no resultado (a query não o seleciona).

- [ ] **Step 3: Selecionar os campos**

Em `lib/db/queries.ts`, no `select` de `fetchBooksWithPagination`, acrescentar:

```ts
read_status: books.read_status,
my_rating: books.my_rating,
```

Em `lib/db/schema.ts`, ampliar o tipo `Book`:

```ts
export type Book = Pick<
  SelectBook,
  'id' | 'title' | 'image_url' | 'thumbhash' | 'read_status' | 'my_rating'
>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/db/cover-fields.test.ts && pnpm typecheck`
Expected: PASS. O typecheck pode acusar consumidores de `Book` — corrija-os no Step 5.

- [ ] **Step 5: Criar `components/cover-badges.tsx`**

```tsx
import { StarIcon } from 'lucide-react';

const STATUS_LABEL: Record<string, { texto: string; classe: string }> = {
  lido: { texto: 'Lido', classe: 'bg-emerald-600' },
  lendo: { texto: 'Lendo', classe: 'bg-amber-500' },
};

export function CoverBadges({
  readStatus,
  myRating,
}: {
  readStatus: string | null;
  myRating: number | null;
}) {
  const status = readStatus ? STATUS_LABEL[readStatus] : undefined;
  const nota = myRating === null ? null : Number(myRating);
  if (!status && nota === null) return null;

  return (
    <>
      {status && (
        <span
          className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow ${status.classe}`}
        >
          {status.texto}
        </span>
      )}
      {nota !== null && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/60 py-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <StarIcon
              key={n}
              aria-hidden
              className={`h-3 w-3 ${n <= nota ? 'fill-yellow-400 text-yellow-400' : 'text-white/40'}`}
            />
          ))}
          <span className="sr-only">{`Sua avaliação: ${nota} de 5`}</span>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 6: Usar no `Photo`**

Em `components/photo.tsx`, acrescentar as props `readStatus?: string | null` e `myRating?: number | null` (default `null`), importar `CoverBadges`, e renderizá-lo **dentro** da `div` com `relative` — tanto no caminho com imagem quanto no placeholder sem capa (um livro lido sem capa também merece o selo).

- [ ] **Step 7: Repassar nos consumidores**

Em `components/grid.tsx`, passar `readStatus={book.read_status}` e `myRating={book.my_rating}` ao `Photo`. Em `app/(main)/[id]/page.tsx`, o mesmo com os campos do `book`. Sem `!`.

- [ ] **Step 8: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: tudo verde.

- [ ] **Step 9: Commit**

```bash
git add components/ lib/db/ app/\(main\)/ test/db/cover-fields.test.ts
git commit -m "feat: show read status badge and personal rating on covers"
```

---

### Task 2: Cliente da Open Library

Módulo isolado, sem banco e sem Storage — é o que o torna testável com `fetch` mockado.

**Files:**
- Create: `lib/openlibrary.ts`, `test/openlibrary.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
```ts
export interface ExternalBook {
  title: string;
  author: string | null;
  publicationYear: number | null;
  numPages: number | null;
  coverId: number | null;
  ratingsAverage: number | null;
  ratingsCount: number | null;
}

export class ExternalSearchError extends Error {}

export async function searchExternalBooks(query: string): Promise<ExternalBook[]>;
```

- [ ] **Step 1: Escrever o teste que falha**

`test/openlibrary.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchExternalBooks, ExternalSearchError } from '@/lib/openlibrary';

afterEach(() => vi.unstubAllGlobals());

function resposta(docs: unknown[]) {
  return new Response(JSON.stringify({ numFound: docs.length, docs }), { status: 200 });
}

describe('searchExternalBooks', () => {
  it('normaliza um resultado completo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta([{
      title: 'The Shining', author_name: ['Stephen King'], first_publish_year: 1977,
      number_of_pages_median: 447, cover_i: 12345,
      ratings_average: 4.3178, ratings_count: 1847,
    }])));

    const [livro] = await searchExternalBooks('the shining');
    expect(livro.title).toBe('The Shining');
    expect(livro.author).toBe('Stephen King');
    expect(livro.publicationYear).toBe(1977);
    expect(livro.numPages).toBe(447);
    expect(livro.coverId).toBe(12345);
    expect(livro.ratingsAverage).toBeCloseTo(4.3178);
    expect(livro.ratingsCount).toBe(1847);
  });

  it('sem avaliação vira null, NUNCA zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta([{ title: 'Sem Nota' }])));
    const [livro] = await searchExternalBooks('x');
    // zero seria uma nota falsa — pior que ausência de nota
    expect(livro.ratingsAverage).toBeNull();
    expect(livro.ratingsCount).toBeNull();
    expect(livro.coverId).toBeNull();
    expect(livro.author).toBeNull();
  });

  it('devolve no máximo 5 resultados', async () => {
    const docs = Array.from({ length: 12 }, (_, i) => ({ title: `L${i}` }));
    vi.stubGlobal('fetch', vi.fn(async () => resposta(docs)));
    expect(await searchExternalBooks('x')).toHaveLength(5);
  });

  it('lista vazia quando não há resultado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta([])));
    expect(await searchExternalBooks('zzzz')).toEqual([]);
  });

  it('lança ExternalSearchError quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 500 })));
    await expect(searchExternalBooks('x')).rejects.toBeInstanceOf(ExternalSearchError);
  });

  it('lança ExternalSearchError quando a rede falha (timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('aborted'); }));
    await expect(searchExternalBooks('x')).rejects.toBeInstanceOf(ExternalSearchError);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/openlibrary.test.ts`
Expected: FAIL — `Cannot find module '@/lib/openlibrary'`

- [ ] **Step 3: Implementar `lib/openlibrary.ts`**

```ts
const SEARCH_URL = 'https://openlibrary.org/search.json';
const CAMPOS = [
  'title', 'author_name', 'first_publish_year', 'number_of_pages_median',
  'cover_i', 'ratings_average', 'ratings_count',
].join(',');
const LIMITE = 5;
const TIMEOUT_MS = 5000;

export interface ExternalBook {
  title: string;
  author: string | null;
  publicationYear: number | null;
  numPages: number | null;
  coverId: number | null;
  ratingsAverage: number | null;
  ratingsCount: number | null;
}

export class ExternalSearchError extends Error {
  constructor(message = 'Não foi possível consultar a Open Library') {
    super(message);
    this.name = 'ExternalSearchError';
  }
}

/** Converte para número ou devolve null — nunca 0 por ausência. */
function numeroOuNulo(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function searchExternalBooks(query: string): Promise<ExternalBook[]> {
  const params = new URLSearchParams({
    q: query, limit: String(LIMITE), fields: CAMPOS,
  });

  let data: { docs?: Record<string, unknown>[] };
  try {
    const res = await fetch(`${SEARCH_URL}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new ExternalSearchError();
    data = await res.json();
  } catch (err) {
    if (err instanceof ExternalSearchError) throw err;
    throw new ExternalSearchError();
  }

  return (data.docs ?? []).slice(0, LIMITE).map((doc) => ({
    title: typeof doc.title === 'string' ? doc.title : 'Sem título',
    author: Array.isArray(doc.author_name) && typeof doc.author_name[0] === 'string'
      ? doc.author_name[0] : null,
    publicationYear: numeroOuNulo(doc.first_publish_year),
    numPages: numeroOuNulo(doc.number_of_pages_median),
    coverId: numeroOuNulo(doc.cover_i),
    ratingsAverage: numeroOuNulo(doc.ratings_average),
    ratingsCount: numeroOuNulo(doc.ratings_count),
  }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/openlibrary.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/openlibrary.ts test/openlibrary.test.ts
git commit -m "feat: add open library search client"
```

---

### Task 3: Rota de busca externa

**Files:**
- Create: `app/api/books/search-external/route.ts`, `test/api/search-external.test.ts`

**Interfaces:**
- Consumes: `searchExternalBooks`/`ExternalSearchError` (Task 2), `getCurrentUserId`, `errorResponse`
- Produces: `GET /api/books/search-external?q=...` → `{ resultados: ExternalBook[] }`

- [ ] **Step 1: Escrever o teste que falha**

`test/api/search-external.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const buscar = vi.fn();
vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/openlibrary', () => ({
  searchExternalBooks: (q: string) => buscar(q),
  ExternalSearchError: class ExternalSearchError extends Error {},
}));

async function GET(url: string) {
  const mod = await import('@/app/api/books/search-external/route');
  return mod.GET(new Request(url));
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/books/search-external', () => {
  it('devolve os candidatos', async () => {
    buscar.mockResolvedValue([{ title: 'The Shining', ratingsAverage: 4.3, ratingsCount: 1847 }]);
    const res = await GET('http://x/api/books/search-external?q=shining');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultados).toHaveLength(1);
    expect(buscar).toHaveBeenCalledWith('shining');
  });

  it('recusa busca vazia com 400', async () => {
    const res = await GET('http://x/api/books/search-external?q=%20%20');
    expect(res.status).toBe(400);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('recusa q ausente com 400', async () => {
    expect((await GET('http://x/api/books/search-external')).status).toBe(400);
  });

  it('devolve 503 quando a Open Library falha', async () => {
    const { ExternalSearchError } = await import('@/lib/openlibrary');
    buscar.mockRejectedValue(new ExternalSearchError('falhou'));
    const res = await GET('http://x/api/books/search-external?q=x');
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/api/search-external.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar a rota**

```ts
import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-user';
import { searchExternalBooks, ExternalSearchError } from '@/lib/openlibrary';
import { errorResponse } from '@/lib/errors';

export async function GET(req: Request) {
  try {
    await getCurrentUserId();   // exige sessão; não usa o id (não toca o banco)

    const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
    if (!q) {
      return NextResponse.json(
        { error: 'Informe o que buscar' }, { status: 400 });
    }

    const resultados = await searchExternalBooks(q);
    return NextResponse.json({ resultados });
  } catch (err) {
    if (err instanceof ExternalSearchError) {
      return NextResponse.json(
        { error: 'Não foi possível buscar agora. Preencha manualmente.' },
        { status: 503 }
      );
    }
    return errorResponse(err, 'Erro ao buscar livros');
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/api/search-external.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add app/api/books/search-external/ test/api/search-external.test.ts
git commit -m "feat: add external book search route"
```

---

### Task 4: Rota de capa (por coverId e por arquivo)

**Files:**
- Create: `lib/covers.ts`, `app/api/books/[id]/cover/route.ts`, `test/api/cover.test.ts`

**Interfaces:**
- Consumes: `uploadCover` (`@/lib/storage`), `withUser`, `getCurrentUserId`, `errorResponse`
- Produces:
```ts
// lib/covers.ts
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Gera thumbhash, sobe ao Storage e grava image_url/thumbhash. Roda em withUser. */
export async function applyCoverFromBuffer(
  userId: string, bookId: number, buf: Buffer, ext: 'jpg' | 'png'
): Promise<string>;

/** Baixa a capa da Open Library a partir do id numérico. Host fixo (AD-7). */
export async function fetchOpenLibraryCover(coverId: number): Promise<Buffer>;
```

- [ ] **Step 1: Escrever o teste que falha**

`test/api/cover.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
const aplicar = vi.fn(async () => 'https://cdn/nova.jpg');
const baixar = vi.fn(async () => Buffer.from('imagem'));

vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));
vi.mock('@/lib/covers', async () => {
  const real = await vi.importActual<typeof import('@/lib/covers')>('@/lib/covers');
  return { ...real, applyCoverFromBuffer: aplicar, fetchOpenLibraryCover: baixar };
});

async function POST(id: string, body: unknown) {
  const mod = await import('@/app/api/books/[id]/cover/route');
  return mod.POST(
    new Request(`http://x/api/books/${id}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  run.mockResolvedValue('manual');   // o handler consulta o source
});

describe('POST /api/books/[id]/cover', () => {
  it('aplica a capa da Open Library por coverId', async () => {
    const res = await POST('1', { coverId: 12345 });
    expect(res.status).toBe(200);
    expect(baixar).toHaveBeenCalledWith(12345);
    expect(aplicar).toHaveBeenCalled();
  });

  it('recusa livro do Calibre com 409', async () => {
    run.mockResolvedValue('calibre');
    const res = await POST('1', { coverId: 12345 });
    expect(res.status).toBe(409);
    expect(baixar).not.toHaveBeenCalled();
  });

  it('recusa livro inexistente com 404', async () => {
    run.mockResolvedValue(null);
    expect((await POST('1', { coverId: 1 })).status).toBe(404);
  });

  it('recusa id não numérico com 400', async () => {
    expect((await POST('abc', { coverId: 1 })).status).toBe(400);
  });

  it('recusa coverId não numérico com 400', async () => {
    expect((await POST('1', { coverId: 'abc' })).status).toBe(400);
  });

  it('AD-7: recusa URL no lugar do coverId — nunca baixa endereço do cliente', async () => {
    const res = await POST('1', { coverUrl: 'http://169.254.169.254/latest/meta-data/' });
    expect(res.status).toBe(400);
    expect(baixar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/api/cover.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `lib/covers.ts`**

```ts
import 'server-only';
import sharp from 'sharp';
import * as ThumbHash from 'thumbhash';
import { eq } from 'drizzle-orm';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { uploadCover } from '@/lib/storage';

export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;

const OPENLIBRARY_COVER_HOST = 'https://covers.openlibrary.org';

async function gerarThumbhash(buf: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(buf)
      .resize(100, 100, { fit: 'inside' }).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    return Buffer.from(
      ThumbHash.rgbaToThumbHash(info.width, info.height, data)
    ).toString('base64');
  } catch {
    return null;
  }
}

export async function applyCoverFromBuffer(
  userId: string, bookId: number, buf: Buffer, ext: 'jpg' | 'png'
): Promise<string> {
  const thumbhash = await gerarThumbhash(buf);
  const imageUrl = await uploadCover(userId, bookId, buf, ext);
  await withUser(userId, (tx) =>
    tx.update(books).set({ image_url: imageUrl, thumbhash })
      .where(eq(books.id, bookId)));
  return imageUrl;
}

/**
 * O host é fixo e o id é numérico: o cliente nunca fornece a URL (AD-7).
 * Aceitar endereço do cliente aqui seria SSRF.
 */
export async function fetchOpenLibraryCover(coverId: number): Promise<Buffer> {
  const url = `${OPENLIBRARY_COVER_HOST}/b/id/${coverId}-L.jpg`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Capa indisponível (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
```

**Decisão sobre webp:** `uploadCover` só aceita `png`/`jpg`/`jpeg` (allowlist da Fundação). Em vez de ampliar a allowlist, **converta webp para jpeg** com `sharp` antes de subir — mantém o Storage com dois formatos apenas e não mexe numa allowlist de segurança. Portanto `applyCoverFromBuffer` recebe `ext: 'jpg' | 'png'`, e quem tratar um upload webp converte antes de chamar:

```ts
// no caminho de upload, quando o arquivo for image/webp:
const jpeg = await sharp(buf).jpeg({ quality: 88 }).toBuffer();
await applyCoverFromBuffer(userId, bookId, jpeg, 'jpg');
```

- [ ] **Step 4: Implementar a rota**

`app/api/books/[id]/cover/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import {
  applyCoverFromBuffer, fetchOpenLibraryCover,
  MAX_COVER_BYTES, TIPOS_ACEITOS,
} from '@/lib/covers';

export async function POST(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = Number((await params).id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    // O RLS escopa por dono: um livro de outro usuário volta como não encontrado.
    const source = await withUser(userId, async (tx) => {
      const [livro] = await tx.select({ source: books.source })
        .from(books).where(eq(books.id, bookId)).limit(1);
      return livro?.source ?? null;
    });

    if (source === null) {
      return NextResponse.json({ error: 'Livro não encontrado' }, { status: 404 });
    }
    if (source !== 'manual') {
      return NextResponse.json({
        error: 'Este livro veio do Calibre. Troque a capa no Calibre e sincronize.',
      }, { status: 409 });
    }

    const contentType = req.headers.get('content-type') ?? '';

    // Caminho 1: capa da Open Library, por id numérico (AD-7).
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const coverId = Number(body.coverId);
      // Só o id numérico é aceito. Uma URL enviada pelo cliente (coverUrl)
      // é ignorada de propósito: baixá-la seria SSRF.
      if (!Number.isInteger(coverId) || coverId <= 0) {
        return NextResponse.json(
          { error: 'coverId inválido' }, { status: 400 });
      }
      const buf = await fetchOpenLibraryCover(coverId);
      const imageUrl = await applyCoverFromBuffer(userId, bookId, buf, 'jpg');
      return NextResponse.json({ success: true, imageUrl });
    }

    // Caminho 2: arquivo enviado pelo usuário.
    const form = await req.formData();
    const arquivo = form.get('file');
    if (!(arquivo instanceof File)) {
      return NextResponse.json(
        { error: 'Envie um arquivo de imagem' }, { status: 400 });
    }
    if (!TIPOS_ACEITOS.includes(arquivo.type as (typeof TIPOS_ACEITOS)[number])) {
      return NextResponse.json(
        { error: `Tipo não suportado: ${arquivo.type}. Use JPEG, PNG ou WebP.` },
        { status: 400 });
    }
    if (arquivo.size > MAX_COVER_BYTES) {
      return NextResponse.json(
        { error: 'A imagem deve ter no máximo 5MB' }, { status: 400 });
    }

    const original = Buffer.from(await arquivo.arrayBuffer());
    // webp é convertido para jpeg: a allowlist do Storage só aceita png/jpg.
    const { buf, ext } = arquivo.type === 'image/webp'
      ? { buf: await sharp(original).jpeg({ quality: 88 }).toBuffer(), ext: 'jpg' as const }
      : { buf: original, ext: arquivo.type === 'image/png' ? 'png' as const : 'jpg' as const };

    const imageUrl = await applyCoverFromBuffer(userId, bookId, buf, ext);
    return NextResponse.json({ success: true, imageUrl });
  } catch (err) {
    return errorResponse(err, 'Erro ao aplicar a capa');
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test:run test/api/cover.test.ts && pnpm typecheck`
Expected: PASS — 6 testes.

- [ ] **Step 6: Commit**

```bash
git add lib/covers.ts app/api/books/\[id\]/cover/ test/api/cover.test.ts
git commit -m "feat: apply book cover from open library or file upload"
```

---

### Task 5: Nota e capa na lista de desejados

**Files:**
- Modify: `lib/db/queries.ts`, `app/api/books/route.ts`
- Test: `test/db/wishlist.test.ts` (acrescentar casos)

**Interfaces:**
- Consumes: colunas existentes
- Produces: `fetchWishlist` devolve também `image_url`, `thumbhash`, `average_rating`, `ratings_count`; `POST /api/books` aceita `averageRating`/`ratingsCount`

- [ ] **Step 1: Acrescentar os testes que falham**

Em `test/db/wishlist.test.ts`, acrescentar:

```ts
it('devolve capa e nota dos leitores', async () => {
  const [u] = await ctx.sql`insert into app_users (email) values ('wn@x.com') returning id`;
  await ctx.sql`
    insert into books (user_id, title, title_source, source, owned,
                       image_url, average_rating, ratings_count)
    values (${u.id}, 'Com Nota', 'Com Nota', 'manual', false,
            'https://cdn/c.jpg', 4.32, 1847)`;
  const { fetchWishlist } = await import('@/lib/db/queries');
  const rows = await fetchWishlist(u.id);
  const livro = rows.find((r) => r.title === 'Com Nota');
  expect(livro?.image_url).toBe('https://cdn/c.jpg');
  expect(Number(livro?.average_rating)).toBeCloseTo(4.32);
  expect(livro?.ratings_count).toBe(1847);
});
```

E em `test/api/books-create.test.ts`:

```ts
it('aceita nota e votos vindos da busca externa', async () => {
  const res = await POST({
    title: 'Da Busca', averageRating: 4.32, ratingsCount: 1847, owned: false,
  });
  expect(res.status).toBe(200);
});

it('recusa averageRating fora de 0..5', async () => {
  expect((await POST({ title: 'X', averageRating: 9 })).status).toBe(400);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/wishlist.test.ts test/api/books-create.test.ts`
Expected: FAIL — campos ausentes; `averageRating` não validado.

- [ ] **Step 3: Ampliar `fetchWishlist`**

No `select`, acrescentar `image_url: books.image_url`, `thumbhash: books.thumbhash`, `average_rating: books.average_rating`, `ratings_count: books.ratings_count`. O `groupBy(books.id)` já existente cobre as colunas novas (são funcionalmente dependentes da PK).

- [ ] **Step 4: Aceitar nota no `POST /api/books`**

Validar e gravar:

```ts
// average_rating é decimal(3,2) na escala 0..5
const avaliacaoExterna = body.averageRating;
let averageRating: string | null = null;
if (avaliacaoExterna !== undefined && avaliacaoExterna !== null) {
  const n = Number(avaliacaoExterna);
  if (!Number.isFinite(n) || n < 0 || n > 5) {
    return NextResponse.json(
      { error: 'A nota deve estar entre 0 e 5' }, { status: 400 });
  }
  averageRating = n.toFixed(2);
}
const ratingsCount = inteiroPositivo(body.ratingsCount);
if (ratingsCount === 'invalido') {
  return NextResponse.json(
    { error: 'Número de votos inválido' }, { status: 400 });
}
```

e incluir `average_rating: averageRating, ratings_count: ratingsCount` no `insert`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test:run test/db/wishlist.test.ts test/api/books-create.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries.ts app/api/books/route.ts test/
git commit -m "feat: store and expose reader rating on wishlist books"
```

---

### Task 6: Interface da lista de desejados

**Files:**
- Modify: `app/(main)/desejados/wishlist-client.tsx`

**Interfaces:**
- Consumes: `GET /api/books/search-external`, `POST /api/books`, `POST /api/books/[id]/cover`, rotas de notas (`/api/books/[id]/notes`), componente `Photo`

- [ ] **Step 1: Busca com escolha de candidato**

No formulário, acrescentar um campo "Buscar na Open Library" com botão. Ao buscar:
- estado de carregando; em 503 mostra "Não foi possível buscar agora. Preencha manualmente." e mantém o formulário utilizável; em lista vazia mostra "Nada encontrado — preencha manualmente".
- os candidatos aparecem em cartões com capa, título, autor, ano, e a nota no formato **`4,32 ★ · 1.847 votos`**; sem nota → **"sem avaliações"** (AD-3).
- **Decisão sobre a miniatura do candidato:** use um `<img>` simples com `https://covers.openlibrary.org/b/id/{coverId}-M.jpg`, **não** o `next/image`. Motivo: usar `next/image` exigiria liberar `covers.openlibrary.org` em `remotePatterns`, abrindo o otimizador do Next a um host externo — para uma miniatura efêmera de pré-visualização, não compensa. A capa definitiva já vem do nosso Storage depois de escolhida. Portanto **`next.config.ts` não muda nesta task.**
- "Escolher" cria o livro via `POST /api/books` com `title/authors/publicationYear/numPages/averageRating/ratingsCount` e `owned: false`; em seguida, se o candidato tem `coverId`, chama `POST /api/books/[id]/cover` com `{ coverId }`. Falha da capa **não** desfaz o livro — mostra aviso e segue. Depois, `router.refresh()`.

- [ ] **Step 2: Capa e nota em cada item da lista**

Cada item passa a mostrar o `Photo` (miniatura) e, quando houver, `4,32 ★ · 1.847 votos`. Sem nota → nada (a lista não precisa dizer "sem avaliações" em cada linha; isso é ruído — a informação importa na hora de escolher).

- [ ] **Step 3: Botão "Enviar capa"**

`<input type="file" accept="image/*">` oculto acionado por um botão; ao escolher, envia `multipart/form-data` para `POST /api/books/[id]/cover`. Erros (tipo/tamanho/409) mostram a mensagem da resposta. Sucesso → `router.refresh()`.

- [ ] **Step 4: Campo de comentário**

Cada item ganha um campo de comentário que grava em `/api/books/[id]/notes` com `kind: 'note'` (AD-8), carregando o comentário existente via `GET` e permitindo editar. Reaproveite o padrão já usado na página do livro.

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: tudo verde. Sem `!` non-null; textos em PT; erro de rede não quebra a página.

- [ ] **Step 6: Commit**

```bash
git add app/\(main\)/desejados/
git commit -m "feat: wishlist search, cover upload and comments"
```

---

## Notas de execução

**Ordem obrigatória:** 2 → 3 → 4 (cliente, rota de busca, rota de capa) antes da 6, que consome as três. A 1 e a 5 são independentes e podem ir em qualquer ponto.

**A Task 4 carrega o item de segurança da spec.** O teste `AD-7: recusa URL no lugar do coverId` é o que prova que o servidor não pode ser induzido a baixar um endereço arbitrário. Se ele não passar, não mergear.

**Fora de escopo, registrado:** coleções/bibliotecas curadas (próxima spec — `collections` + `book_collections` muitos-para-muitos, etiquetas clicáveis na página do livro, `/colecoes`, seleção múltipla no catálogo); botão de sincronizar o Calibre pela interface (só viável com o app rodando local).

**Pendência herdada:** o corte de RLS de produção (`book_app` com senha + `POSTGRES_URL` apontando para ele). Enquanto a app conectar como `postgres`, a RLS fica inerte.
