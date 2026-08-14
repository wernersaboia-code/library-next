# Sync incremental do Calibre + livros manuais e desejados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a ingestão do Calibre idempotente e incremental (sem duplicar, preservando o tracking), e permitir registrar livros fora do Calibre — incluindo os que o dono deseja adquirir.

**Architecture:** O `uuid` do Calibre vira a chave de identidade (`books.calibre_uuid`, único por usuário via índice parcial). Duas colunas novas separam origem (`source`: calibre/manual) de posse (`owned`), independentes do status de leitura. O script de import passa a fazer upsert por uuid, atualizando só metadados e pulando livros cujo `last_modified` não mudou. Rotas novas permitem criar e apagar livros manuais; o catálogo ganha filtro de posse e as estatísticas de leitura passam a ignorar posse.

**Tech Stack:** Next.js 15.5, React 19, TypeScript 5.5 (strict), Drizzle 0.33 + postgres-js, Supabase (Postgres + Storage), sql.js (leitura do Calibre), Vitest, ESLint.

## Global Constraints

- **Spec de referência:** `docs/superpowers/specs/2026-08-13-calibre-sync-wishlist-design.md`. Divergência → a spec vence; pare e pergunte.
- **A regra mestra (AD-3):** o sync escreve metadados (`title`, `title_source`, autores, `genre`, `publisher`, `num_pages`, `publication_year`, `series`, `language_code`, `image_url`, `thumbhash`) e **NUNCA** escreve `read_status`, `my_rating`, `date_started`, `date_finished`, nem toca em `highlights`.
- **O sync só toca em `source='calibre'`.** Livros `source='manual'` são invioláveis.
- **Chave de identidade:** `(user_id, calibre_uuid)`. Nunca casar por ISBN nem por título+autor.
- **Todo acesso a dados do usuário passa por `withUser`** (RLS). Sem exceção nas rotas.
- **Nenhum `!` non-null assertion** — ESLint `error`, gate bloqueante. Mensagens de UI/erro em português; código em inglês.
- **`git` neste repo:** exportar antes de qualquer git — `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'`. Nunca `git config --global`.
- **Segredos:** nunca imprimir `.env`/`.env.test`. Testes de banco usam `requireTestDatabaseUrl()` e `createTestDb` (isolamento por schema).
- **Migrations vão até `0009`.** As desta spec são `0010` em diante.
- **CI:** `pnpm typecheck` + `pnpm lint` + `pnpm test:run` seguem gates bloqueantes.

## Aviso de segurança de dados (ler antes da Task 1)

A migration desta spec **apaga os 1.318 livros atuais** (`source='calibre' AND calibre_uuid IS NULL`), porque foram importados sem uuid e o sync os trataria como manuais. Isso foi verificado como seguro em 2026-08-13: **0 status marcados, 0 avaliações, 0 datas, 0 notas**.

**Antes de aplicar a migration em produção, reconfirme** com esta consulta (read-only):

```sql
select
  (select count(*) from books where read_status is distinct from 'não lido') as status,
  (select count(*) from books where my_rating is not null)                   as ratings,
  (select count(*) from books where date_started is not null
                                 or date_finished is not null)               as datas,
  (select count(*) from highlights)                                          as notas;
```

Se qualquer contador for maior que zero, **PARE** e escale — a limpeza destruiria tracking real e o plano precisa de uma etapa de adoção por título+autor que não está desenhada aqui.

---

## File Structure

**Criados**

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/migrations/0010_sync_ownership.sql` | Colunas `calibre_uuid`/`calibre_modified`/`source`/`owned`, índice parcial único, CHECK, limpeza única |
| `lib/db/calibre-sync.ts` | Lógica pura do sync: decidir inserir/atualizar/pular/desmarcar por livro |
| `app/api/books/route.ts` | `POST` — cria livro manual |
| `app/(main)/desejados/page.tsx` | Página da lista de desejados (server component) |
| `app/(main)/desejados/wishlist-client.tsx` | Client: formulário de adicionar + botão "Já tenho" |
| `test/db/sync-schema.test.ts` | Colunas, CHECK, índice parcial |
| `test/import/sync.test.ts` | Idempotência e preservação de tracking (o teste central) |
| `test/api/books-create.test.ts` | `POST /api/books` e `DELETE /api/books/[id]` |

**Modificados**

| Arquivo | Mudança |
|---|---|
| `lib/db/schema.ts` | Colunas novas em `books` |
| `lib/db/import-calibre.ts` | Passa a usar `lib/db/calibre-sync.ts`; grava uuid/modified; resumo com contadores |
| `app/api/books/[id]/route.ts` | Ganha `DELETE` (só manuais; Calibre → 409) |
| `lib/db/queries.ts` | Filtro de posse em `fetchBooksWithPagination`/`estimateTotalBooks` |
| `lib/url-state.ts` | `posse?: string` em `SearchParams` |
| `components/filters.tsx` | Seletor de posse |
| `app/api/reading/stats/route.ts` | Métricas de leitura ignoram posse; total conta só possuídos |
| `components/nav-bar.tsx` | Link para `/desejados` |

---

### Task 1: Schema de origem e posse

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0010_sync_ownership.sql`, `test/db/sync-schema.test.ts`

**Interfaces:**
- Consumes: schema existente
- Produces: colunas `books.calibre_uuid`, `books.calibre_modified`, `books.source`, `books.owned`

- [ ] **Step 1: Escrever o teste que falha**

`test/db/sync-schema.test.ts`:

```ts
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

  it('permite vários livros manuais (calibre_uuid nulo) — índice é parcial', async () => {
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
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/sync-schema.test.ts`
Expected: FAIL — `column "source" does not exist`

- [ ] **Step 3: Atualizar `lib/db/schema.ts`**

Na tabela `books`, acrescentar às colunas:

```ts
calibre_uuid: text('calibre_uuid'),
calibre_modified: text('calibre_modified'),
source: text('source').notNull().default('calibre'),
owned: boolean('owned').notNull().default(true),
```

Importar `boolean` de `drizzle-orm/pg-core`. No objeto de índices da tabela, acrescentar:

```ts
userOwnedIdx: index('idx_books_user_owned').on(t.userId, t.owned),
```

- [ ] **Step 4: Criar a migration**

Rodar `pnpm db:generate` e então **editar o SQL gerado** (renomeando para `0010_sync_ownership.sql` e ajustando o `_journal.json` se necessário), garantindo que ele contenha, além das colunas:

```sql
ALTER TABLE "books" ADD CONSTRAINT "books_source_check"
  CHECK ("source" IN ('calibre','manual'));

-- Parcial: livros manuais (uuid nulo) não competem pela unicidade.
CREATE UNIQUE INDEX "books_user_calibre_uuid_unique"
  ON "books" ("user_id", "calibre_uuid") WHERE "calibre_uuid" IS NOT NULL;

-- Limpeza única: os registros importados antes do uuid seriam tratados como
-- manuais pelo sync. Seguro porque não há tracking (ver o aviso do plano).
DELETE FROM "books" WHERE "source" = 'calibre' AND "calibre_uuid" IS NULL;
```

O drizzle-kit não gera CHECK nem índice parcial — acrescente à mão. Confirme com `pnpm db:generate` dizendo "No schema changes" ao final.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test:run test/db/sync-schema.test.ts && pnpm typecheck`
Expected: PASS — 4 testes; typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/ test/db/sync-schema.test.ts
git commit -m "feat: add calibre identity and ownership columns to books"
```

---

### Task 2: Lógica do sync (decisão por livro)

Extrai a decisão do sync para um módulo puro e testável, sem I/O de Calibre nem de Storage.

**Files:**
- Create: `lib/db/calibre-sync.ts`, `test/import/sync-decision.test.ts`

**Interfaces:**
- Consumes: schema (Task 1)
- Produces:

```ts
export interface CalibreBookInput {
  uuid: string;
  lastModified: string;
  title: string;
  authors: string[];
  publicationYear: number | null;
  publisher: string | null;
  series: string | null;
  languageCode: string | null;
  description: string | null;
  genre: string | null;
  numPages: number | null;
  averageRating: string | null;
  isbn: string | null;
  isbn13: string | null;
  hasCover: boolean;
  /** Caminho relativo da pasta do livro no Calibre (coluna `path`), onde vive cover.jpg */
  path: string;
}

export interface ExistingBook {
  id: number;
  calibreModified: string | null;
}

export type SyncDecision =
  | { kind: 'insert' }
  | { kind: 'update'; bookId: number }
  | { kind: 'skip'; bookId: number };

export function decideSync(
  input: CalibreBookInput,
  existing: ExistingBook | undefined
): SyncDecision;

/** Campos de metadados que o sync escreve. Nunca inclui tracking. */
export function metadataValues(input: CalibreBookInput): Record<string, unknown>;
```

- [ ] **Step 1: Escrever o teste que falha**

`test/import/sync-decision.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideSync, metadataValues, type CalibreBookInput } from '@/lib/db/calibre-sync';

function input(over: Partial<CalibreBookInput> = {}): CalibreBookInput {
  return {
    uuid: 'u-1', lastModified: '2026-01-01 10:00:00+00:00',
    title: 'Livro', authors: ['Autor'], publicationYear: 2020,
    publisher: 'Ed', series: null, languageCode: 'pt', description: 'd',
    genre: 'Ficção', numPages: 300, averageRating: '4.00',
    isbn: null, isbn13: null, hasCover: true, path: 'Autor/Livro (1)', ...over,
  };
}

describe('decideSync', () => {
  it('insere quando o livro não existe', () => {
    expect(decideSync(input(), undefined)).toEqual({ kind: 'insert' });
  });

  it('pula quando last_modified é igual', () => {
    expect(decideSync(input(), { id: 7, calibreModified: '2026-01-01 10:00:00+00:00' }))
      .toEqual({ kind: 'skip', bookId: 7 });
  });

  it('atualiza quando last_modified mudou', () => {
    expect(decideSync(input(), { id: 7, calibreModified: '2025-12-01 09:00:00+00:00' }))
      .toEqual({ kind: 'update', bookId: 7 });
  });

  it('atualiza quando o existente não tem calibre_modified', () => {
    expect(decideSync(input(), { id: 7, calibreModified: null }))
      .toEqual({ kind: 'update', bookId: 7 });
  });
});

describe('metadataValues', () => {
  it('inclui os campos de catálogo', () => {
    const v = metadataValues(input());
    expect(v.title).toBe('Livro');
    expect(v.title_source).toBe('Livro');
    expect(v.genre).toBe('Ficção');
    expect(v.num_pages).toBe(300);
    expect(v.calibre_modified).toBe('2026-01-01 10:00:00+00:00');
  });

  it('NUNCA inclui campos de tracking — a regra mestra da spec', () => {
    const v = metadataValues(input());
    for (const proibido of [
      'read_status', 'my_rating', 'date_started', 'date_finished', 'owned', 'source',
    ]) {
      expect(v).not.toHaveProperty(proibido);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/import/sync-decision.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db/calibre-sync'`

- [ ] **Step 3: Implementar `lib/db/calibre-sync.ts`**

```ts
export interface CalibreBookInput {
  uuid: string;
  lastModified: string;
  title: string;
  authors: string[];
  publicationYear: number | null;
  publisher: string | null;
  series: string | null;
  languageCode: string | null;
  description: string | null;
  genre: string | null;
  numPages: number | null;
  averageRating: string | null;
  isbn: string | null;
  isbn13: string | null;
  hasCover: boolean;
  /** Caminho relativo da pasta do livro no Calibre (coluna `path`), onde vive cover.jpg */
  path: string;
}

export interface ExistingBook {
  id: number;
  calibreModified: string | null;
}

export type SyncDecision =
  | { kind: 'insert' }
  | { kind: 'update'; bookId: number }
  | { kind: 'skip'; bookId: number };

export function decideSync(
  input: CalibreBookInput,
  existing: ExistingBook | undefined
): SyncDecision {
  if (!existing) return { kind: 'insert' };
  if (existing.calibreModified === input.lastModified) {
    return { kind: 'skip', bookId: existing.id };
  }
  return { kind: 'update', bookId: existing.id };
}

/**
 * Só metadados de catálogo. Tracking (read_status, my_rating, datas) e posse
 * (owned, source) ficam de fora por decisão de arquitetura — ver AD-3 da spec.
 */
export function metadataValues(input: CalibreBookInput): Record<string, unknown> {
  return {
    title: input.title,
    title_source: input.title,
    isbn: input.isbn,
    isbn13: input.isbn13,
    publication_year: input.publicationYear,
    publisher: input.publisher,
    series: input.series,
    language_code: input.languageCode,
    description: input.description,
    genre: input.genre,
    num_pages: input.numPages,
    average_rating: input.averageRating,
    calibre_modified: input.lastModified,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/import/sync-decision.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/db/calibre-sync.ts test/import/sync-decision.test.ts
git commit -m "feat: add calibre sync decision logic"
```

---

### Task 3: Import do Calibre vira sync idempotente

**Files:**
- Modify: `lib/db/import-calibre.ts`
- Create: `test/import/sync.test.ts`

**Interfaces:**
- Consumes: `decideSync`/`metadataValues`/`CalibreBookInput` (Task 2), `authorId` (`@/lib/authors`), `uploadCover`, `withUser`
- Produces, exportadas de `lib/db/import-calibre.ts`:

```ts
export interface SyncSummary {
  novos: number;
  atualizados: number;
  pulados: number;
  naoPossuidos: number;
  erros: number;
}

/** Lê o metadata.db do Calibre. Faz I/O de arquivo; não toca no banco. */
export function readCalibreLibrary(calibrePath: string): CalibreBookInput[];

/**
 * Escreve no banco. Recebe os livros já lidos — é o que permite testar o
 * sync sem um metadata.db real. `calibrePath` serve só para localizar as
 * capas no disco (`{calibrePath}/{bookPath}/cover.jpg`).
 */
export function syncCalibreBooks(
  userId: string,
  livros: CalibreBookInput[],
  calibrePath: string
): Promise<SyncSummary>;
```

O campo `path` de `CalibreBookInput` (definido na Task 2) é o caminho relativo da pasta do livro no Calibre, usado para localizar `cover.jpg`.

- [ ] **Step 1: Escrever o teste central (idempotência + preservação)**

`test/import/sync.test.ts`. Usa `createTestDb` e mocka o Storage; a leitura do Calibre é injetada como lista de `CalibreBookInput` para não depender de um `metadata.db` real:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/import/sync.test.ts`
Expected: FAIL — `syncCalibreBooks` não existe.

- [ ] **Step 3: Refatorar `lib/db/import-calibre.ts`**

Separar a leitura do Calibre da escrita no banco:

- `readCalibreLibrary(calibrePath: string): CalibreBookInput[]` — lê o `metadata.db` com `sql.js` e devolve a lista (a lógica de queries que já existe, reorganizada).
- `syncCalibreBooks(userId: string, livros: CalibreBookInput[], calibrePath: string): Promise<SyncSummary>` — a escrita, testável sem arquivo:
  1. Carrega os existentes: `select id, calibre_uuid, calibre_modified from books where source='calibre'` (dentro de `withUser`), num `Map` por uuid.
  2. Para cada livro, `decideSync`. Em `insert`: insere com `metadataValues(...)` + `calibre_uuid`, `source='calibre'`, `owned=true`, `read_status='não lido'`. Em `update`: `update ... set metadataValues(...)` e **nada mais** — o `set` é literalmente o retorno de `metadataValues`, o que torna impossível escrever tracking por engano. Em `skip`: não faz nada.
  3. Autores: em insert e update, resolve por `authorId(nome)` e recalcula os vínculos `book_to_author` do livro.
  4. Capa: só em `insert` e `update`, e só se `hasCover`. Falha de capa registra aviso e segue (padrão da Fundação).
  5. Ao final, os uuids presentes no banco e ausentes na lista recebem `owned=false` (um `update ... where calibre_uuid not in (...) and source='calibre' and owned=true`). Cuidado com lista vazia — nesse caso todos os `calibre` viram `owned=false`.
  6. Devolve o `SyncSummary`.
- `main()` passa a chamar `readCalibreLibrary` + `syncCalibreBooks` e imprime o resumo.

Cada livro é processado isoladamente (try/catch por livro, incrementando `erros`), para um problemático não abortar os demais.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/import/sync.test.ts && pnpm typecheck`
Expected: PASS — 5 testes; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add lib/db/import-calibre.ts test/import/sync.test.ts
git commit -m "feat: make calibre import an idempotent incremental sync"
```

---

### Task 4: Criar e apagar livros manuais

**Files:**
- Create: `app/api/books/route.ts`, `test/api/books-create.test.ts`
- Modify: `app/api/books/[id]/route.ts`

**Interfaces:**
- Consumes: `getCurrentUserId` (`@/lib/auth-user`), `withUser`, `errorResponse`, `authorId` (`@/lib/authors`)
- Produces: `POST /api/books`; `DELETE /api/books/[id]`

- [ ] **Step 1: Escrever os testes que falham**

`test/api/books-create.test.ts` (mesmo padrão de mock de `test/api/books.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));

async function POST(body: unknown) {
  const mod = await import('@/app/api/books/route');
  return mod.POST(new Request('http://x/api/books', {
    method: 'POST', body: JSON.stringify(body),
  }));
}

async function DELETE(id: string) {
  const mod = await import('@/app/api/books/[id]/route');
  return mod.DELETE(
    new Request(`http://x/api/books/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => { vi.clearAllMocks(); run.mockResolvedValue([{ id: 1 }]); });

describe('POST /api/books', () => {
  it('cria livro manual dentro de withUser', async () => {
    const res = await POST({ title: 'Meu Desejado', authors: ['Autor X'] });
    expect(res.status).toBe(200);
    const { withUser } = await import('@/lib/db/with-user');
    expect(withUser).toHaveBeenCalledWith('u-1', expect.any(Function));
  });

  it('recusa título vazio', async () => {
    expect((await POST({ title: '   ' })).status).toBe(400);
  });

  it('recusa numPages negativo', async () => {
    expect((await POST({ title: 'X', numPages: -3 })).status).toBe(400);
  });
});

describe('DELETE /api/books/[id]', () => {
  it('apaga livro manual', async () => {
    run.mockResolvedValue([{ id: 1 }]);          // uma linha apagada
    expect((await DELETE('1')).status).toBe(200);
  });

  it('recusa apagar livro do Calibre com 409', async () => {
    run.mockResolvedValue([]);                    // where source='manual' não casou
    // a rota consulta o source antes; ver implementação
    const res = await DELETE('1');
    expect([409, 404]).toContain(res.status);
  });

  it('recusa id não numérico', async () => {
    expect((await DELETE('abc')).status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/api/books-create.test.ts`
Expected: FAIL — `@/app/api/books/route` não existe.

- [ ] **Step 3: Implementar `app/api/books/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books, authors, bookToAuthor } from '@/lib/db/schema';
import { authorId } from '@/lib/authors';
import { errorResponse } from '@/lib/errors';

function inteiroPositivo(v: unknown): number | null | 'invalido' {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return 'invalido';
  return n;
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await req.json();

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'O título é obrigatório' }, { status: 400 });
    }

    const numPages = inteiroPositivo(body.numPages);
    if (numPages === 'invalido') {
      return NextResponse.json(
        { error: 'Número de páginas deve ser um inteiro positivo' }, { status: 400 });
    }
    const publicationYear = inteiroPositivo(body.publicationYear);
    if (publicationYear === 'invalido') {
      return NextResponse.json(
        { error: 'Ano de publicação deve ser um inteiro positivo' }, { status: 400 });
    }

    const nomes: string[] = Array.isArray(body.authors)
      ? body.authors.filter((a: unknown): a is string => typeof a === 'string' && a.trim() !== '')
      : [];

    const bookId = await withUser(userId, async (tx) => {
      const [book] = await tx.insert(books).values({
        userId,
        title,
        title_source: title,
        source: 'manual',
        owned: body.owned === true,
        num_pages: numPages,
        publication_year: publicationYear,
        publisher: typeof body.publisher === 'string' ? body.publisher : null,
        genre: typeof body.genre === 'string' ? body.genre : null,
      }).returning({ id: books.id });

      for (const nome of nomes) {
        const id = authorId(nome);
        await tx.insert(authors).values({ id, name: nome }).onConflictDoNothing();
        await tx.insert(bookToAuthor).values({ bookId: book.id, authorId: id })
          .onConflictDoNothing();
      }
      return book.id;
    });

    return NextResponse.json({ success: true, bookId });
  } catch (err) {
    return errorResponse(err, 'Erro ao criar o livro');
  }
}
```

- [ ] **Step 4: Acrescentar `DELETE` a `app/api/books/[id]/route.ts`**

```ts
export async function DELETE(
  _req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = Number((await params).id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const resultado = await withUser(userId, async (tx) => {
      const [livro] = await tx.select({ source: books.source })
        .from(books).where(eq(books.id, bookId)).limit(1);
      if (!livro) return 'nao-encontrado' as const;
      if (livro.source !== 'manual') return 'do-calibre' as const;
      await tx.delete(books).where(eq(books.id, bookId));
      return 'apagado' as const;
    });

    if (resultado === 'nao-encontrado') {
      return NextResponse.json({ error: 'Livro não encontrado' }, { status: 404 });
    }
    if (resultado === 'do-calibre') {
      return NextResponse.json({
        error: 'Este livro veio do Calibre. Remova-o da biblioteca do Calibre e sincronize.',
      }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao remover o livro');
  }
}
```

Ajustar o teste do Step 1 (caso "recusa apagar livro do Calibre") para mockar o retorno `'do-calibre'` conforme esta implementação, e afirmar `409` exatamente.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test:run test/api/books-create.test.ts && pnpm typecheck`
Expected: PASS; typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add app/api/books/ test/api/books-create.test.ts
git commit -m "feat: create and delete manual books"
```

---

### Task 5: Filtro de posse no catálogo e estatísticas por leitura

**Files:**
- Modify: `lib/url-state.ts`, `lib/db/queries.ts`, `components/filters.tsx`, `app/api/reading/stats/route.ts`
- Create: `test/db/ownership-filter.test.ts`

**Interfaces:**
- Consumes: colunas `owned` (Task 1)
- Produces: `SearchParams.posse?: 'possuidos' | 'nao-possuidos' | 'todos'`

- [ ] **Step 1: Escrever o teste que falha**

`test/db/ownership-filter.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  const [u] = await ctx.sql`insert into app_users (email) values ('o@x.com') returning id`;
  userId = u.id;

  // 2 possuídos: um lido (100 pág, terminado em 2026), um não lido
  await ctx.sql`
    insert into books (user_id, title, title_source, owned, read_status,
                       num_pages, date_finished)
    values (${userId}, 'Possuido Lido', 'Possuido Lido', true, 'lido', 100, '2026-02-01')`;
  await ctx.sql`
    insert into books (user_id, title, title_source, owned, read_status)
    values (${userId}, 'Possuido Nao Lido', 'Possuido Nao Lido', true, 'não lido')`;
  // 1 NÃO possuído, mas LIDO (200 pág, terminado em 2025) — apagado do Calibre
  await ctx.sql`
    insert into books (user_id, title, title_source, owned, read_status,
                       num_pages, date_finished)
    values (${userId}, 'Sumiu do Calibre', 'Sumiu do Calibre', false, 'lido', 200, '2025-03-01')`;
});
afterAll(() => ctx.cleanup());

describe('filtro de posse no catálogo', () => {
  it('por padrão lista só os possuídos', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {});
    expect(rows).toHaveLength(2);
  });

  it('posse=todos lista tudo', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, { posse: 'todos' });
    expect(rows).toHaveLength(3);
  });

  it('posse=nao-possuidos lista só o que não tenho', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, { posse: 'nao-possuidos' });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Sumiu do Calibre');
  });
});

describe('estatísticas ignoram posse (AD-7)', () => {
  it('apagar do Calibre não apaga o histórico de leitura', async () => {
    const mod = await import('@/app/api/reading/stats/route');
    vi.doMock('@/lib/auth-user', () => ({
      getCurrentUserId: async () => userId,
      AuthError: class extends Error {},
    }));
    const res = await mod.GET();
    const body = await res.json();

    // leitura conta TODOS: o lido possuído + o lido que sumiu do Calibre
    expect(body.lidos).toBe(2);
    expect(body.paginasLidas).toBe(300);
    expect(body.porAno).toEqual({ '2025': 1, '2026': 1 });

    // acervo conta só possuídos
    expect(body.totalBooks).toBe(2);
    expect(body.naoLidos).toBe(1);
  });
});
```

Se o mock de `@/lib/auth-user` precisar ser içado para antes do import da rota, mova o `vi.doMock` para o topo do arquivo (junto ao de `@/lib/db/drizzle`) — o importante é a rota rodar com o `userId` da suíte.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/ownership-filter.test.ts`
Expected: FAIL — filtro inexistente; `lidos` conta errado.

- [ ] **Step 3: `posse` em `SearchParams`**

Em `lib/url-state.ts`, acrescentar à interface `posse?: string;  // possuidos | nao-possuidos | todos` e a linha correspondente em `parseSearchParams` (`posse: typeof params.posse === 'string' ? params.posse : undefined`).

- [ ] **Step 4: Filtro em `lib/db/queries.ts`**

Acrescentar aos filtros:

```ts
const posseFilter = (posse?: string) => {
  if (posse === 'todos') return undefined;
  if (posse === 'nao-possuidos') return eq(books.owned, false);
  return eq(books.owned, true);   // default: possuídos
};
```

e incluí-lo em `buildFilters`. Isso cobre `fetchBooksWithPagination` e `estimateTotalBooks`, que já usam `buildFilters`.

- [ ] **Step 5: Seletor no painel de filtros**

Em `components/filters.tsx`, acrescentar um seletor "Posse" com as três opções (`Possuídos` / `Não possuídos` / `Todos`), seguindo o padrão dos seletores existentes do arquivo e escrevendo `posse` na query string.

- [ ] **Step 6: Estatísticas ignoram posse (AD-7)**

Em `app/api/reading/stats/route.ts`, dentro do `withUser`:
- `lidos`, `lendo`, `paginasLidas` e `porAno` — **sem** filtro de `owned`.
- `totalBooks` — `where(eq(books.owned, true))`.
- `naoLidos` continua sendo derivado de `totalBooks - lendo - lidos`; como agora `lidos`/`lendo` podem incluir não-possuídos, calcule-o em SQL: `count(*) where owned = true and read_status = 'não lido'`.

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm test:run test/db/ownership-filter.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS; typecheck limpo; lint 0 erros.

- [ ] **Step 8: Commit**

```bash
git add lib/url-state.ts lib/db/queries.ts components/filters.tsx app/api/reading/stats/route.ts test/db/ownership-filter.test.ts
git commit -m "feat: ownership filter in catalog; reading stats ignore ownership"
```

---

### Task 6: Página da lista de desejados

**Files:**
- Create: `app/(main)/desejados/page.tsx`, `app/(main)/desejados/wishlist-client.tsx`
- Modify: `components/nav-bar.tsx`, `lib/db/queries.ts`

**Interfaces:**
- Consumes: `POST /api/books` e `DELETE /api/books/[id]` (Task 4); `getCurrentUserId`; `withUser`
- Produces: `fetchWishlist(userId: string)` em `lib/db/queries.ts`

- [ ] **Step 1: Query da lista**

Em `lib/db/queries.ts`:

```ts
export async function fetchWishlist(userId: string) {
  return withUser(userId, (tx) =>
    tx.select({
      id: books.id,
      title: books.title,
      publication_year: books.publication_year,
      num_pages: books.num_pages,
      createdAt: books.createdAt,
    })
      .from(books)
      .where(and(eq(books.source, 'manual'), eq(books.owned, false)))
      .orderBy(books.createdAt)
  );
}
```

- [ ] **Step 2: Página (server component)**

`app/(main)/desejados/page.tsx` — obtém `userId` com `await getCurrentUserId()`, chama `fetchWishlist`, e renderiza `<WishlistClient initial={livros} />`. Título "Quero ter" e um texto curto explicando que são livros fora do Calibre.

- [ ] **Step 3: Client component**

`app/(main)/desejados/wishlist-client.tsx` — `'use client'`:
- Formulário de adicionar: título (obrigatório), autor, ano, páginas. `POST /api/books` com `owned: false`; em erro mostra a mensagem da resposta; em sucesso, `router.refresh()`.
- Lista os livros com botão **"Já tenho"**, que faz `DELETE /api/books/{id}` e `router.refresh()`.
- Antes de apagar, busca as notas do livro (`GET /api/books/{id}/notes`); se houver, pede confirmação nomeando a quantidade ("Este livro tem 2 notas. Apagar mesmo?"). Se não houver, apaga direto.
- Sem `!` non-null; textos em português; erro de rede não quebra a página.

- [ ] **Step 4: Link na navegação**

Em `components/nav-bar.tsx`, acrescentar um link para `/desejados` ao lado dos existentes.

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: typecheck limpo, lint 0 erros, todos os testes passam.

- [ ] **Step 6: Commit**

```bash
git add app/\(main\)/desejados/ components/nav-bar.tsx lib/db/queries.ts
git commit -m "feat: wishlist page with add and 'já tenho' actions"
```

---

## Notas de execução

**Ordem obrigatória:** 1 → 2 → 3 (schema, lógica, sync). Depois 4, 5, 6 — que dependem das colunas da Task 1 mas são independentes entre si.

**A Task 3 é o portão de qualidade.** Se `test/import/sync.test.ts` não passar inteiro — especialmente a idempotência e a preservação de tracking — nada mais deve ser mergeado: o objetivo declarado da spec não foi cumprido.

**Etapa manual (com o usuário), após o código:**
1. Reconfirmar que não há tracking (a consulta do topo deste plano). Se houver, **parar**.
2. `pnpm db:migrate` (aplica a `0010`, que apaga os 1.318 registros sem uuid).
3. `pnpm db:import-calibre --email=<conta> --path="G:\Meu Drive\Livros"` — repovoa com uuid.
4. Rodar o mesmo comando **de novo** e confirmar que o resumo mostra `pulados: 1318`, `novos: 0`. É a prova em produção de que o sync é idempotente.

**Pendência herdada, ainda em aberto:** o corte de RLS de produção (`book_app` com senha + `POSTGRES_URL` apontando para ele). Enquanto a app conectar como `postgres`, a RLS fica inerte em produção.
