# Bibliotecas (coleções curadas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o dono crie conjuntos nomeados de livros ("bibliotecas"), monte-os em lote a partir do catálogo, ajuste-os livro a livro, e navegue por eles pela página de bibliotecas, pelo filtro do catálogo e pelas etiquetas na página do livro.

**Architecture:** Duas tabelas novas (`collections` e `book_collections`, muitos-para-muitos) com RLS no padrão já usado pelo projeto. Nenhuma coluna é acrescentada a `books` e o campo `genre` não é tocado. As rotas de vínculo operam em lote e são idempotentes, de modo que a seleção múltipla (28 ids) e a marcação individual (1 id) usem o mesmo código.

**Tech Stack:** Next.js 15.5, React 19, TypeScript 5.5 (strict), Drizzle + postgres-js, Vitest, ESLint.

## Global Constraints

- **Spec de referência:** `docs/superpowers/specs/2026-08-14-bibliotecas-design.md`. Divergência → a spec vence; pare e pergunte.
- **Nenhuma coluna nova em `books`.** O campo `genre` não é alterado, migrado nem removido (AD-4).
- **Todo acesso a dados do usuário passa por `withUser`** (RLS). Nenhum `!` non-null assertion (ESLint `error`, gate bloqueante).
- **Lote idempotente (AD-6).** Repetir um livro já vinculado nunca é erro; a resposta informa quantos vínculos foram criados de fato.
- **Livro de outro dono é ignorado em silêncio (AD-7)**, nunca recusado com mensagem — recusar confirmaria a existência de registro que a RLS esconde.
- **Teto de 200 livros por requisição** nas rotas de vínculo.
- **PT/inglês:** interface e mensagens de erro em português (a palavra é "biblioteca"); código, tabelas e rotas em inglês (`collections`).
- **`git` neste repo:** exportar antes de qualquer git — `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'`. Nunca `git config --global`.
- **Segredos:** nunca imprimir `.env`/`.env.test`. Testes de banco usam `createTestDb` (isolamento por schema).
- **Migrations são escritas à mão** neste projeto (ver `0007`–`0011`), e cada uma exige uma entrada nova em `lib/db/migrations/meta/_journal.json`. Não rode `drizzle-kit generate`.
- **Gates:** `pnpm typecheck` + `pnpm lint` + `pnpm test:run` precisam ficar verdes ao fim de cada task.

---

## File Structure

**Criados**

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/migrations/0012_collections.sql` | Tabelas, índices, RLS e grants |
| `lib/db/collections.ts` | Consultas de bibliotecas. Sem HTTP, sem React |
| `app/api/collections/route.ts` | `GET` lista, `POST` cria |
| `app/api/collections/[id]/route.ts` | `PATCH` renomeia, `DELETE` apaga |
| `app/api/collections/[id]/books/route.ts` | `POST`/`DELETE` de vínculos em lote |
| `app/(main)/bibliotecas/page.tsx` | Página da lista (server) |
| `app/(main)/bibliotecas/bibliotecas-client.tsx` | Criar, renomear, apagar (client) |
| `app/(main)/bibliotecas/[id]/page.tsx` | Uma biblioteca aberta |
| `app/(main)/[id]/book-collections.tsx` | Etiquetas + marcar/desmarcar na página do livro |
| `test/db/collections-schema.test.ts` | Schema, RLS, índice único, cascades |
| `test/db/collections-queries.test.ts` | Consultas e filtro do catálogo |
| `test/api/collections.test.ts` | Rotas de CRUD |
| `test/api/collection-books.test.ts` | Rotas de vínculo |

**Modificados**

| Arquivo | Mudança |
|---|---|
| `lib/db/schema.ts` | Tabelas `collections`/`bookCollections`; `Book` ganha `owned` |
| `lib/db/migrations/meta/_journal.json` | Entrada da 0012 |
| `lib/db/queries.ts` | `owned` na listagem; filtro `bib`; bibliotecas em `fetchBookById` |
| `lib/url-state.ts` | Parâmetro `bib` |
| `components/filters.tsx` | Seletor de biblioteca |
| `components/cover-badges.tsx` | Selo "Quero ter" |
| `components/photo.tsx` | Prop `owned` |
| `components/grid.tsx` | Modo de seleção múltipla |
| `components/nav-bar.tsx` | Link "Bibliotecas" |
| `app/(main)/page.tsx` | Passa bibliotecas à grade |
| `app/(main)/[id]/page.tsx` | Renderiza `BookCollections` |

---

### Task 1: Tabelas, RLS e cascades

**Files:**
- Create: `lib/db/migrations/0012_collections.sql`, `test/db/collections-schema.test.ts`
- Modify: `lib/db/schema.ts`, `lib/db/migrations/meta/_journal.json`

**Interfaces:**
- Consumes: `app_users`, `books`, `app_current_user_id()` (migration `0007`)
- Produces:
```ts
// lib/db/schema.ts
export const collections: PgTable;      // id, userId, name, createdAt
export const bookCollections: PgTable;  // bookId, collectionId, addedAt
export type SelectCollection = typeof collections.$inferSelect;
```

- [ ] **Step 1: Escrever o teste que falha**

`test/db/collections-schema.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const [u] = await ctx.sql`insert into app_users (email) values ('col@x.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

async function novaColecao(nome: string): Promise<number> {
  const [c] = await ctx.sql`
    insert into collections (user_id, name) values (${userId}, ${nome}) returning id`;
  return c.id;
}

async function novoLivro(titulo: string): Promise<number> {
  const [b] = await ctx.sql`
    insert into books (user_id, title, title_source)
    values (${userId}, ${titulo}, ${titulo}) returning id`;
  return b.id;
}

describe('schema de bibliotecas', () => {
  it('cria uma biblioteca com nome e dono', async () => {
    const id = await novaColecao('Terror');
    const [c] = await ctx.sql`select name, user_id from collections where id = ${id}`;
    expect(c.name).toBe('Terror');
    expect(c.user_id).toBe(userId);
  });

  it('recusa nome repetido ignorando maiúsculas (AD-8)', async () => {
    await novaColecao('Ficção Científica');
    await expect(
      novaColecao('ficção científica')
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('vincula livro a biblioteca', async () => {
    const c = await novaColecao('Vínculo');
    const b = await novoLivro('Livro A');
    await ctx.sql`
      insert into book_collections (book_id, collection_id) values (${b}, ${c})`;
    const rows = await ctx.sql`
      select book_id from book_collections where collection_id = ${c}`;
    expect(rows).toHaveLength(1);
  });

  it('recusa vincular o mesmo livro duas vezes', async () => {
    const c = await novaColecao('Duplo');
    const b = await novoLivro('Livro B');
    await ctx.sql`insert into book_collections (book_id, collection_id) values (${b}, ${c})`;
    await expect(ctx.sql`
      insert into book_collections (book_id, collection_id) values (${b}, ${c})`
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('apagar a biblioteca remove os vínculos e PRESERVA os livros', async () => {
    const c = await novaColecao('Some');
    const b = await novoLivro('Sobrevivente');
    await ctx.sql`insert into book_collections (book_id, collection_id) values (${b}, ${c})`;

    await ctx.sql`delete from collections where id = ${c}`;

    const vinculos = await ctx.sql`
      select book_id from book_collections where collection_id = ${c}`;
    expect(vinculos).toHaveLength(0);
    const livro = await ctx.sql`select id from books where id = ${b}`;
    expect(livro).toHaveLength(1);
  });

  it('apagar o livro remove os vínculos dele', async () => {
    const c = await novaColecao('Perde Livro');
    const b = await novoLivro('Efêmero');
    await ctx.sql`insert into book_collections (book_id, collection_id) values (${b}, ${c})`;

    await ctx.sql`delete from books where id = ${b}`;

    const vinculos = await ctx.sql`
      select book_id from book_collections where book_id = ${b}`;
    expect(vinculos).toHaveLength(0);
  });

  it('as duas tabelas têm RLS habilitada e forçada', async () => {
    const rows = await ctx.sql`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relname in ('collections', 'book_collections')
        and relnamespace = current_schema()::regnamespace`;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.relrowsecurity).toBe(true);
      expect(r.relforcerowsecurity).toBe(true);
    }
  });

  it('a policy do vínculo exige dono da biblioteca E do livro (AD-7)', async () => {
    const [p] = await ctx.sql`
      select qual::text as expressao from pg_policies
      where tablename = 'book_collections' and schemaname = current_schema()`;
    expect(p).toBeDefined();
    if (!p) return;
    expect(String(p.expressao)).toMatch(/collections/);
    expect(String(p.expressao)).toMatch(/books/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/collections-schema.test.ts`
Expected: FAIL — `relation "collections" does not exist`.

- [ ] **Step 3: Escrever a migration**

`lib/db/migrations/0012_collections.sql`:

```sql
CREATE TABLE IF NOT EXISTS "collections" (
  "id"         serial PRIMARY KEY,
  "user_id"    uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- O nome é o único identificador que o dono enxerga: "Terror" e "terror"
-- lado a lado criariam duas estantes que ele acredita ser uma só (AD-8).
CREATE UNIQUE INDEX IF NOT EXISTS "collections_user_name_unique"
  ON "collections" ("user_id", lower("name"));--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "book_collections" (
  "book_id"       integer NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "collection_id" integer NOT NULL REFERENCES "collections"("id") ON DELETE CASCADE,
  "added_at"      timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("collection_id", "book_id")
);--> statement-breakpoint

-- A PK composta já indexa (collection_id, book_id); este índice atende o
-- caminho inverso, usado pelas etiquetas na página do livro.
CREATE INDEX IF NOT EXISTS "idx_book_collections_book"
  ON "book_collections" ("book_id");--> statement-breakpoint

ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS collections_owner ON "collections";--> statement-breakpoint
CREATE POLICY collections_owner ON "collections"
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());--> statement-breakpoint

ALTER TABLE "book_collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "book_collections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS book_collections_owner ON "book_collections";--> statement-breakpoint

-- Sem user_id próprio: a posse é herdada, como em book_to_author. Checa os
-- DOIS lados — só a biblioteca deixaria a brecha de vincular livro alheio
-- a uma biblioteca própria (AD-7).
CREATE POLICY book_collections_owner ON "book_collections"
  USING (
    EXISTS (SELECT 1 FROM collections c
            WHERE c.id = book_collections.collection_id
              AND c.user_id = app_current_user_id())
    AND EXISTS (SELECT 1 FROM books b
            WHERE b.id = book_collections.book_id
              AND b.user_id = app_current_user_id()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM collections c
            WHERE c.id = book_collections.collection_id
              AND c.user_id = app_current_user_id())
    AND EXISTS (SELECT 1 FROM books b
            WHERE b.id = book_collections.book_id
              AND b.user_id = app_current_user_id()));--> statement-breakpoint

-- Grants só em produção (schema public), no mesmo guard da 0007: nos testes
-- cada suíte roda num schema test_* e não deve tocar papéis do cluster.
DO $$
BEGIN
  IF current_schema() = 'public'
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'book_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON collections, book_collections TO book_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE collections_id_seq TO book_app';
  END IF;
END
$$;
```

- [ ] **Step 4: Registrar no journal**

Em `lib/db/migrations/meta/_journal.json`, acrescentar ao fim do array `entries` (depois da entrada `0011_series_index`):

```json
    {
      "idx": 12,
      "version": "7",
      "when": 1786752000000,
      "tag": "0012_collections",
      "breakpoints": true
    }
```

- [ ] **Step 5: Declarar as tabelas no schema**

Em `lib/db/schema.ts`, depois de `bookToAuthor`:

```ts
export const collections = pgTable(
  'collections',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow().notNull(),
  },
  (t) => ({ userIdx: index('idx_collections_user').on(t.userId) })
);

export const bookCollections = pgTable(
  'book_collections',
  {
    bookId: integer('book_id').notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    collectionId: integer('collection_id').notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true })
      .defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.collectionId, t.bookId] }),
    bookIdx: index('idx_book_collections_book').on(t.bookId),
  })
);

export type SelectCollection = typeof collections.$inferSelect;
```

**Nota deliberada:** o índice único de `(user_id, lower(name))` existe **só na migration**, não no schema Drizzle. Índices sobre expressão não são expressáveis de forma confiável nesta versão do drizzle-kit, e as migrations deste projeto são escritas à mão — declarar ali seria duplicar sem ganho. O 409 de nome repetido (Task 3) depende do índice do banco, e o teste do Step 1 o cobre.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm test:run test/db/collections-schema.test.ts && pnpm typecheck`
Expected: PASS — 8 testes.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/ test/db/collections-schema.test.ts
git commit -m "feat: add collections tables with ownership policies"
```

---

### Task 2: Consultas de bibliotecas

**Files:**
- Create: `lib/db/collections.ts`, `test/db/collections-queries.test.ts`

**Interfaces:**
- Consumes: `withUser`, `collections`, `bookCollections`, `books` (Task 1)
- Produces:
```ts
export interface CollectionWithCount { id: number; name: string; total: number }
export interface CollectionBook {
  id: number; title: string; image_url: string | null; thumbhash: string | null;
  read_status: string; my_rating: number | null; owned: boolean;
}

export async function fetchCollections(userId: string): Promise<CollectionWithCount[]>;
export async function fetchCollection(
  userId: string, id: number
): Promise<{ id: number; name: string } | undefined>;
export async function fetchCollectionBooks(
  userId: string, id: number
): Promise<CollectionBook[]>;
```

- [ ] **Step 1: Escrever o teste que falha**

`test/db/collections-queries.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;
let terror: number;
let vazia: number;

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));

  const [u] = await ctx.sql`insert into app_users (email) values ('cq@x.com') returning id`;
  userId = u.id;

  const [t] = await ctx.sql`
    insert into collections (user_id, name) values (${userId}, 'Terror') returning id`;
  terror = t.id;
  const [v] = await ctx.sql`
    insert into collections (user_id, name) values (${userId}, 'Aventura') returning id`;
  vazia = v.id;

  const [possuido] = await ctx.sql`
    insert into books (user_id, title, title_source, owned, read_status)
    values (${userId}, 'It', 'It', true, 'lido') returning id`;
  const [desejado] = await ctx.sql`
    insert into books (user_id, title, title_source, source, owned)
    values (${userId}, 'Carrie', 'Carrie', 'manual', false) returning id`;

  await ctx.sql`
    insert into book_collections (book_id, collection_id)
    values (${possuido.id}, ${terror})`;
  await ctx.sql`
    insert into book_collections (book_id, collection_id)
    values (${desejado.id}, ${terror})`;
});
afterAll(() => ctx.cleanup());

describe('fetchCollections', () => {
  it('conta os livros de cada biblioteca e ordena por nome', async () => {
    const { fetchCollections } = await import('@/lib/db/collections');
    const rows = await fetchCollections(userId);
    expect(rows.map((r) => r.name)).toEqual(['Aventura', 'Terror']);
    expect(rows.find((r) => r.name === 'Terror')?.total).toBe(2);
  });

  it('biblioteca sem livros aparece com total zero', async () => {
    const { fetchCollections } = await import('@/lib/db/collections');
    const rows = await fetchCollections(userId);
    expect(rows.find((r) => r.id === vazia)?.total).toBe(0);
  });
});

describe('fetchCollection', () => {
  it('devolve a biblioteca pelo id', async () => {
    const { fetchCollection } = await import('@/lib/db/collections');
    expect((await fetchCollection(userId, terror))?.name).toBe('Terror');
  });

  it('devolve undefined para id inexistente', async () => {
    const { fetchCollection } = await import('@/lib/db/collections');
    expect(await fetchCollection(userId, 999999)).toBeUndefined();
  });
});

describe('fetchCollectionBooks', () => {
  it('devolve os livros com o campo owned, para o selo "Quero ter" (AD-3)', async () => {
    const { fetchCollectionBooks } = await import('@/lib/db/collections');
    const livros = await fetchCollectionBooks(userId, terror);
    expect(livros).toHaveLength(2);
    expect(livros.find((l) => l.title === 'It')?.owned).toBe(true);
    expect(livros.find((l) => l.title === 'Carrie')?.owned).toBe(false);
  });

  it('traz o status de leitura para as marcações da capa', async () => {
    const { fetchCollectionBooks } = await import('@/lib/db/collections');
    const livros = await fetchCollectionBooks(userId, terror);
    expect(livros.find((l) => l.title === 'It')?.read_status).toBe('lido');
  });

  it('biblioteca vazia devolve lista vazia', async () => {
    const { fetchCollectionBooks } = await import('@/lib/db/collections');
    expect(await fetchCollectionBooks(userId, vazia)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/collections-queries.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db/collections'`.

- [ ] **Step 3: Implementar `lib/db/collections.ts`**

```ts
// lib/db/collections.ts
import { sql, eq, and, asc } from 'drizzle-orm';
import { books, collections, bookCollections } from './schema';
import { withUser } from './with-user';

export interface CollectionWithCount {
  id: number;
  name: string;
  total: number;
}

export interface CollectionBook {
  id: number;
  title: string;
  image_url: string | null;
  thumbhash: string | null;
  read_status: string;
  my_rating: number | null;
  owned: boolean;
}

/** Ordenada por nome: o dono procura pelo nome, não pela data de criação. */
export async function fetchCollections(
  userId: string
): Promise<CollectionWithCount[]> {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({
        id: collections.id,
        name: collections.name,
        // count sobre a coluna do leftJoin (não count(*)): biblioteca sem
        // livro precisa devolver 0, e count(*) devolveria 1.
        total: sql<number>`count(${bookCollections.bookId})`,
      })
      .from(collections)
      .leftJoin(
        bookCollections,
        eq(bookCollections.collectionId, collections.id)
      )
      .groupBy(collections.id)
      .orderBy(asc(collections.name))
  );

  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

export async function fetchCollection(
  userId: string,
  id: number
): Promise<{ id: number; name: string } | undefined> {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ id: collections.id, name: collections.name })
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1)
  );
  return rows[0];
}

export async function fetchCollectionBooks(
  userId: string,
  id: number
): Promise<CollectionBook[]> {
  return withUser(userId, (tx) =>
    tx
      .select({
        id: books.id,
        title: books.title,
        image_url: books.image_url,
        thumbhash: books.thumbhash,
        read_status: books.read_status,
        my_rating: books.my_rating,
        owned: books.owned,
      })
      .from(bookCollections)
      .innerJoin(books, eq(books.id, bookCollections.bookId))
      .where(eq(bookCollections.collectionId, id))
      .orderBy(asc(bookCollections.addedAt))
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/db/collections-queries.test.ts && pnpm typecheck`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/db/collections.ts test/db/collections-queries.test.ts
git commit -m "feat: add collection queries with book counts"
```

---

### Task 3: Rotas de CRUD de bibliotecas

**Files:**
- Create: `app/api/collections/route.ts`, `app/api/collections/[id]/route.ts`, `test/api/collections.test.ts`

**Interfaces:**
- Consumes: `fetchCollections` (Task 2), `getCurrentUserId`, `withUser`, `errorResponse`
- Produces:
  - `GET /api/collections` → `{ colecoes: CollectionWithCount[] }`
  - `POST /api/collections` `{ name }` → `{ id, name }` | 400 | 409
  - `PATCH /api/collections/[id]` `{ name }` → `{ success: true }` | 400 | 404 | 409
  - `DELETE /api/collections/[id]` → `{ success: true }` | 400 | 404

- [ ] **Step 1: Escrever o teste que falha**

`test/api/collections.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
const listar = vi.fn();

vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));
vi.mock('@/lib/db/collections', () => ({
  fetchCollections: () => listar(),
}));

async function GET() {
  const mod = await import('@/app/api/collections/route');
  return mod.GET();
}

async function POST(body: unknown) {
  const mod = await import('@/app/api/collections/route');
  return mod.POST(new Request('http://x/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

async function PATCH(id: string, body: unknown) {
  const mod = await import('@/app/api/collections/[id]/route');
  return mod.PATCH(
    new Request(`http://x/api/collections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

async function DELETE(id: string) {
  const mod = await import('@/app/api/collections/[id]/route');
  return mod.DELETE(
    new Request(`http://x/api/collections/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) }
  );
}

/** Erro de violação de índice único, como o postgres-js entrega. */
function erroDuplicado() {
  return Object.assign(new Error('duplicate key value'), { code: '23505' });
}

beforeEach(() => {
  vi.clearAllMocks();
  run.mockResolvedValue([{ id: 7, name: 'Terror' }]);
});

describe('GET /api/collections', () => {
  it('devolve as bibliotecas', async () => {
    listar.mockResolvedValue([{ id: 1, name: 'Terror', total: 3 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).colecoes).toHaveLength(1);
  });
});

describe('POST /api/collections', () => {
  it('cria e devolve a biblioteca', async () => {
    const res = await POST({ name: 'Terror' });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('Terror');
  });

  it('apara espaços do nome', async () => {
    await POST({ name: '  Terror  ' });
    expect(run).toHaveBeenCalled();
  });

  it('recusa nome vazio com 400', async () => {
    const res = await POST({ name: '   ' });
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('recusa nome ausente com 400', async () => {
    expect((await POST({})).status).toBe(400);
  });

  it('nome repetido responde 409, não erro de banco (AD-8)', async () => {
    run.mockRejectedValue(erroDuplicado());
    const res = await POST({ name: 'Terror' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/já existe/i);
  });
});

describe('PATCH /api/collections/[id]', () => {
  it('renomeia', async () => {
    expect((await PATCH('7', { name: 'Horror' })).status).toBe(200);
  });

  it('recusa id não numérico com 400', async () => {
    expect((await PATCH('abc', { name: 'X' })).status).toBe(400);
  });

  it('recusa nome vazio com 400', async () => {
    expect((await PATCH('7', { name: '  ' })).status).toBe(400);
  });

  it('biblioteca inexistente responde 404', async () => {
    run.mockResolvedValue([]);
    expect((await PATCH('7', { name: 'X' })).status).toBe(404);
  });

  it('nome repetido responde 409', async () => {
    run.mockRejectedValue(erroDuplicado());
    expect((await PATCH('7', { name: 'Terror' })).status).toBe(409);
  });
});

describe('DELETE /api/collections/[id]', () => {
  it('apaga', async () => {
    expect((await DELETE('7')).status).toBe(200);
  });

  it('biblioteca inexistente responde 404', async () => {
    run.mockResolvedValue([]);
    expect((await DELETE('7')).status).toBe(404);
  });

  it('recusa id não numérico com 400', async () => {
    expect((await DELETE('abc')).status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/api/collections.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Criar o módulo de validação de nome**

`lib/collections-input.ts`:

```ts
/** Violação do índice único de nome — o dono já tem uma biblioteca assim. */
export function ehNomeDuplicado(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err
    && (err as { code?: string }).code === '23505';
}

export const NOME_DUPLICADO = 'Já existe uma biblioteca com esse nome';
export const NOME_VAZIO = 'Dê um nome à biblioteca';

/** Nome aparado, ou null quando ausente/vazio. */
export function nomeValido(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}
```

**Por que num módulo à parte:** arquivos `route.ts` do App Router só podem exportar os handlers HTTP (`GET`, `POST`, …) e alguns campos de configuração. Exportar helpers dali faz o build falhar com "Route has an invalid export". As duas rotas importam daqui.

- [ ] **Step 4: Criar a rota de coleção**

`app/api/collections/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { collections } from '@/lib/db/schema';
import { fetchCollections } from '@/lib/db/collections';
import { errorResponse } from '@/lib/errors';
import {
  ehNomeDuplicado, nomeValido, NOME_DUPLICADO, NOME_VAZIO,
} from '@/lib/collections-input';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const colecoes = await fetchCollections(userId);
    return NextResponse.json({ colecoes });
  } catch (err) {
    return errorResponse(err, 'Erro ao listar as bibliotecas');
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await req.json();
    const name = nomeValido(body.name);
    if (name === null) {
      return NextResponse.json({ error: NOME_VAZIO }, { status: 400 });
    }

    const rows = await withUser(userId, (tx) =>
      tx.insert(collections).values({ userId, name })
        .returning({ id: collections.id, name: collections.name }));

    return NextResponse.json(rows[0]);
  } catch (err) {
    if (ehNomeDuplicado(err)) {
      return NextResponse.json({ error: NOME_DUPLICADO }, { status: 409 });
    }
    return errorResponse(err, 'Erro ao criar a biblioteca');
  }
}
```

- [ ] **Step 5: Criar a rota de renomear e apagar**

`app/api/collections/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { collections } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import {
  ehNomeDuplicado, nomeValido, NOME_DUPLICADO, NOME_VAZIO,
} from '@/lib/collections-input';

const NAO_ENCONTRADA = 'Biblioteca não encontrada';

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const body = await req.json();
    const name = nomeValido(body.name);
    if (name === null) {
      return NextResponse.json({ error: NOME_VAZIO }, { status: 400 });
    }

    // A RLS escopa por dono: biblioteca de outro usuário não é atingida e
    // volta como não encontrada.
    const rows = await withUser(userId, (tx) =>
      tx.update(collections).set({ name })
        .where(eq(collections.id, id))
        .returning({ id: collections.id }));

    if (rows.length === 0) {
      return NextResponse.json({ error: NAO_ENCONTRADA }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (ehNomeDuplicado(err)) {
      return NextResponse.json({ error: NOME_DUPLICADO }, { status: 409 });
    }
    return errorResponse(err, 'Erro ao renomear a biblioteca');
  }
}

export async function DELETE(
  _req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    // Os vínculos caem por cascade; os livros permanecem no acervo.
    const rows = await withUser(userId, (tx) =>
      tx.delete(collections).where(eq(collections.id, id))
        .returning({ id: collections.id }));

    if (rows.length === 0) {
      return NextResponse.json({ error: NAO_ENCONTRADA }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao apagar a biblioteca');
  }
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm test:run test/api/collections.test.ts && pnpm typecheck`
Expected: PASS — 13 testes.

- [ ] **Step 7: Commit**

```bash
git add lib/collections-input.ts app/api/collections/ test/api/collections.test.ts
git commit -m "feat: add collection crud routes"
```

---

### Task 4: Rotas de vínculo em lote

**Files:**
- Create: `app/api/collections/[id]/books/route.ts`, `test/api/collection-books.test.ts`

**Interfaces:**
- Consumes: `withUser`, `getCurrentUserId`, `errorResponse`, `collections`, `bookCollections`
- Produces:
  - `POST /api/collections/[id]/books` `{ bookIds: number[] }` → `{ adicionados: number }`
  - `DELETE /api/collections/[id]/books` `{ bookIds: number[] }` → `{ removidos: number }`

- [ ] **Step 1: Escrever o teste que falha**

`test/api/collection-books.test.ts`:

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

async function chamar(metodo: 'POST' | 'DELETE', id: string, body: unknown) {
  const mod = await import('@/app/api/collections/[id]/books/route');
  const req = new Request(`http://x/api/collections/${id}/books`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ctx = { params: Promise.resolve({ id }) };
  return metodo === 'POST' ? mod.POST(req, ctx) : mod.DELETE(req, ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  run.mockResolvedValue(2);   // o handler devolve a contagem de linhas afetadas
});

describe('POST /api/collections/[id]/books', () => {
  it('vincula um lote e informa quantos entraram', async () => {
    const res = await chamar('POST', '7', { bookIds: [1, 2] });
    expect(res.status).toBe(200);
    expect((await res.json()).adicionados).toBe(2);
  });

  it('aceita um único livro (mesma rota da marcação individual, AD-6)', async () => {
    run.mockResolvedValue(1);
    const res = await chamar('POST', '7', { bookIds: [42] });
    expect(res.status).toBe(200);
    expect((await res.json()).adicionados).toBe(1);
  });

  it('repetir livro já vinculado não é erro e conta zero (AD-6)', async () => {
    run.mockResolvedValue(0);
    const res = await chamar('POST', '7', { bookIds: [1] });
    expect(res.status).toBe(200);
    expect((await res.json()).adicionados).toBe(0);
  });

  it('biblioteca inexistente responde 404', async () => {
    run.mockResolvedValue(null);   // o handler devolve null quando não acha
    expect((await chamar('POST', '7', { bookIds: [1] })).status).toBe(404);
  });

  it('recusa lista vazia com 400', async () => {
    const res = await chamar('POST', '7', { bookIds: [] });
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('recusa bookIds ausente com 400', async () => {
    expect((await chamar('POST', '7', {})).status).toBe(400);
  });

  it('recusa id de livro não numérico com 400', async () => {
    expect((await chamar('POST', '7', { bookIds: ['abc'] })).status).toBe(400);
  });

  it('recusa mais de 200 livros com 400', async () => {
    const muitos = Array.from({ length: 201 }, (_, i) => i + 1);
    const res = await chamar('POST', '7', { bookIds: muitos });
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('recusa id de biblioteca não numérico com 400', async () => {
    expect((await chamar('POST', 'abc', { bookIds: [1] })).status).toBe(400);
  });
});

describe('DELETE /api/collections/[id]/books', () => {
  it('desvincula um lote', async () => {
    const res = await chamar('DELETE', '7', { bookIds: [1, 2] });
    expect(res.status).toBe(200);
    expect((await res.json()).removidos).toBe(2);
  });

  it('biblioteca inexistente responde 404', async () => {
    run.mockResolvedValue(null);
    expect((await chamar('DELETE', '7', { bookIds: [1] })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/api/collection-books.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar a rota**

`app/api/collections/[id]/books/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { collections, bookCollections } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';

const MAX_LOTE = 200;
const NAO_ENCONTRADA = 'Biblioteca não encontrada';

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** null quando a lista é inválida — vazia, malformada ou acima do teto. */
function parseBookIds(valor: unknown): number[] | null {
  if (!Array.isArray(valor) || valor.length === 0) return null;
  if (valor.length > MAX_LOTE) return null;
  const ids: number[] = [];
  for (const bruto of valor) {
    const n = Number(bruto);
    if (!Number.isInteger(n) || n <= 0) return null;
    ids.push(n);
  }
  return ids;
}

export async function POST(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const collectionId = parseId((await params).id);
    if (collectionId === null) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const body = await req.json();
    const bookIds = parseBookIds(body.bookIds);
    if (bookIds === null) {
      return NextResponse.json(
        { error: `Informe de 1 a ${MAX_LOTE} livros` }, { status: 400 });
    }

    const adicionados = await withUser(userId, async (tx) => {
      const [colecao] = await tx.select({ id: collections.id })
        .from(collections).where(eq(collections.id, collectionId)).limit(1);
      if (!colecao) return null;

      // onConflictDoNothing: repetir um livro já vinculado não derruba o
      // lote (AD-6). Livro de outro dono é barrado pela policy WITH CHECK
      // e simplesmente não entra — sem mensagem, para não revelar que
      // existe (AD-7).
      const inseridos = await tx.insert(bookCollections)
        .values(bookIds.map((bookId) => ({ bookId, collectionId })))
        .onConflictDoNothing()
        .returning({ bookId: bookCollections.bookId });

      return inseridos.length;
    });

    if (adicionados === null) {
      return NextResponse.json({ error: NAO_ENCONTRADA }, { status: 404 });
    }
    return NextResponse.json({ adicionados });
  } catch (err) {
    return errorResponse(err, 'Erro ao adicionar livros à biblioteca');
  }
}

export async function DELETE(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const collectionId = parseId((await params).id);
    if (collectionId === null) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const body = await req.json();
    const bookIds = parseBookIds(body.bookIds);
    if (bookIds === null) {
      return NextResponse.json(
        { error: `Informe de 1 a ${MAX_LOTE} livros` }, { status: 400 });
    }

    const removidos = await withUser(userId, async (tx) => {
      const [colecao] = await tx.select({ id: collections.id })
        .from(collections).where(eq(collections.id, collectionId)).limit(1);
      if (!colecao) return null;

      const apagados = await tx.delete(bookCollections)
        .where(and(
          eq(bookCollections.collectionId, collectionId),
          inArray(bookCollections.bookId, bookIds)
        ))
        .returning({ bookId: bookCollections.bookId });

      return apagados.length;
    });

    if (removidos === null) {
      return NextResponse.json({ error: NAO_ENCONTRADA }, { status: 404 });
    }
    return NextResponse.json({ removidos });
  } catch (err) {
    return errorResponse(err, 'Erro ao remover livros da biblioteca');
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/api/collection-books.test.ts && pnpm typecheck`
Expected: PASS — 11 testes.

- [ ] **Step 5: Commit**

```bash
git add "app/api/collections/[id]/books/" test/api/collection-books.test.ts
git commit -m "feat: add batch collection membership routes"
```

---

### Task 5: Filtro do catálogo por biblioteca

**Files:**
- Modify: `lib/url-state.ts`, `lib/db/queries.ts`, `components/filters.tsx`, `app/(main)/page.tsx`
- Test: `test/db/collections-queries.test.ts` (acrescentar casos)

**Interfaces:**
- Consumes: `bookCollections` (Task 1), `applyFilter` (já existe)
- Produces: `SearchParams.bib?: string`; `fetchBooksWithPagination` passa a filtrar por biblioteca

- [ ] **Step 1: Acrescentar os testes que falham**

Em `test/db/collections-queries.test.ts`, acrescentar ao fim:

```ts
describe('filtro do catálogo por biblioteca', () => {
  it('devolve só os livros vinculados', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {
      bib: String(terror), posse: 'todos',
    });
    expect(rows.map((r) => r.title).sort()).toEqual(['Carrie', 'It']);
  });

  it('combina com os filtros existentes', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {
      bib: String(terror), status: 'lido', posse: 'todos',
    });
    expect(rows.map((r) => r.title)).toEqual(['It']);
  });

  it('biblioteca vazia devolve nada', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {
      bib: String(vazia), posse: 'todos',
    });
    expect(rows).toEqual([]);
  });

  it('bib não numérico é ignorado em vez de quebrar a página', async () => {
    const { fetchBooksWithPagination } = await import('@/lib/db/queries');
    const rows = await fetchBooksWithPagination(userId, {
      bib: 'abc', posse: 'todos',
    });
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/collections-queries.test.ts`
Expected: FAIL — o filtro não existe, então `bib` é ignorado e o primeiro teste devolve livros demais.

- [ ] **Step 3: Acrescentar o parâmetro `bib`**

Em `lib/url-state.ts`, dentro de `SearchParams`:

```ts
  bib?: string;     // id da biblioteca (coleção)
```

e dentro do objeto devolvido por `parseSearchParams`:

```ts
    bib: typeof params.bib === 'string' ? params.bib : undefined,
```

- [ ] **Step 4: Implementar o filtro**

Em `lib/db/queries.ts`, acrescentar o import de `bookCollections`:

```ts
import { books, authors, bookToAuthor, bookCollections } from './schema';
```

acrescentar o filtro junto dos demais:

```ts
// Filtra por pertencer a uma biblioteca. `exists` em vez de join: um join
// multiplicaria linhas se o livro estivesse em várias bibliotecas, e a
// listagem passaria a repetir capas.
const bibFilter = (bib?: string) => {
    if (!bib) return undefined;
    const id = Number(bib);
    // Id inválido vira "sem filtro": um link torto não deve quebrar a página.
    if (!Number.isInteger(id) || id <= 0) return undefined;
    return sql`exists (
        select 1 from ${bookCollections} bc
        where bc.book_id = ${books.id} and bc.collection_id = ${id}
    )`;
};
```

e incluí-lo em `buildFilters`, depois de `posseFilter(searchParams.posse)`:

```ts
        bibFilter(searchParams.bib),
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test:run test/db/collections-queries.test.ts && pnpm typecheck`
Expected: PASS — 10 testes no arquivo.

- [ ] **Step 6: Seletor na barra lateral**

Em `components/filters.tsx`, o componente recebe as bibliotecas por props. Acrescentar ao topo do arquivo:

```ts
export interface BibliotecaOption { id: number; name: string }
```

Na assinatura de `FilterBase`, acrescentar a prop:

```tsx
function FilterBase({
  searchParams,
  bibliotecas = [],
}: FilterProps & { bibliotecas?: BibliotecaOption[] }) {
```

E, dentro do `ScrollArea`, logo depois do bloco de Série, acrescentar:

```tsx
            {/* Biblioteca */}
            {bibliotecas.length > 0 && (
              <div>
                <Label htmlFor="biblioteca">Biblioteca</Label>
                <Select
                    value={optimisticFilters.bib ?? 'todos'}
                    onValueChange={(value) => handleSelectChange('bib', value)}
                >
                  <SelectTrigger id="biblioteca" className="mt-2">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {bibliotecas.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
```

No fim do mesmo arquivo, os dois componentes exportados passam a repassar a prop:

```tsx
export function FilterFallback() {
  return <FilterBase searchParams={new URLSearchParams()} />;
}

export function Filter({ bibliotecas }: { bibliotecas?: BibliotecaOption[] }) {
  const searchParams = useSearchParams();
  return <FilterBase searchParams={searchParams} bibliotecas={bibliotecas} />;
}
```

`FilterFallback` fica sem bibliotecas de propósito: é o esqueleto exibido antes da hidratação, e o padrão `bibliotecas = []` já esconde o bloco.

- [ ] **Step 7: Alimentar o seletor a partir do layout**

`app/(main)/layout.tsx` é server component e passa a buscar as bibliotecas. Acrescentar os imports:

```tsx
import { fetchCollections } from '@/lib/db/collections';
import { getCurrentUserId } from '@/lib/auth-user';
```

tornar a função assíncrona e buscar antes do retorno:

```tsx
export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = await getCurrentUserId();
  const bibliotecas = await fetchCollections(userId);
```

e passar ao filtro:

```tsx
              <Filter bibliotecas={bibliotecas} />
```

O `Filter` é componente de cliente recebendo props de um server component — os objetos são serializáveis (números e strings), então isso é válido.

- [ ] **Step 8: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build`
Expected: tudo verde.

- [ ] **Step 9: Commit**

```bash
git add lib/url-state.ts lib/db/queries.ts components/filters.tsx "app/(main)/" test/
git commit -m "feat: filter catalog by collection"
```

---

### Task 6: Página de bibliotecas

**Files:**
- Create: `app/(main)/bibliotecas/page.tsx`, `app/(main)/bibliotecas/bibliotecas-client.tsx`
- Modify: `components/nav-bar.tsx`

**Interfaces:**
- Consumes: `fetchCollections` (Task 2), rotas da Task 3
- Produces: rota `/bibliotecas`

- [ ] **Step 1: Criar a página servidora**

`app/(main)/bibliotecas/page.tsx`:

```tsx
import { fetchCollections } from '@/lib/db/collections';
import { getCurrentUserId } from '@/lib/auth-user';
import { BibliotecasClient } from './bibliotecas-client';

export default async function BibliotecasPage() {
  const userId = await getCurrentUserId();
  const colecoes = await fetchCollections(userId);

  return (
    <div className="max-w-2xl mx-auto w-full p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bibliotecas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Conjuntos de livros que você monta — por tema, por fila de leitura,
          pelo que fizer sentido.
        </p>
      </div>
      <BibliotecasClient initial={colecoes} />
    </div>
  );
}
```

- [ ] **Step 2: Criar o cliente**

`app/(main)/bibliotecas/bibliotecas-client.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Biblioteca {
  id: number;
  name: string;
  total: number;
}

export function BibliotecasClient({ initial }: { initial: Biblioteca[] }) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');

  async function criar() {
    const limpo = nome.trim();
    if (!limpo) {
      setErro('Dê um nome à biblioteca.');
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: limpo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível criar a biblioteca.');
        return;
      }
      setNome('');
      router.refresh();
    } catch {
      setErro('Falha de rede ao criar a biblioteca.');
    } finally {
      setSalvando(false);
    }
  }

  async function renomear(id: number) {
    const limpo = nomeEditado.trim();
    if (!limpo) {
      setErro('Dê um nome à biblioteca.');
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: limpo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível renomear.');
        return;
      }
      setEditandoId(null);
      router.refresh();
    } catch {
      setErro('Falha de rede ao renomear.');
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(b: Biblioteca) {
    // Diz o tamanho do estrago antes de fazer: os livros ficam, os
    // vínculos não.
    const confirmado = confirm(
      b.total > 0
        ? `Apagar "${b.name}"? ${b.total} livro(s) sairão dela, mas continuam no acervo.`
        : `Apagar "${b.name}"?`
    );
    if (!confirmado) return;

    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/collections/${b.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível apagar.');
        return;
      }
      router.refresh();
    } catch {
      setErro('Falha de rede ao apagar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-md p-4 space-y-3">
        <Label className="block" htmlFor="nova-biblioteca">
          Nova biblioteca
        </Label>
        <div className="flex gap-2">
          <Input
            id="nova-biblioteca"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void criar();
              }
            }}
            placeholder="Ex.: Terror, Ler em 2027"
          />
          <Button type="button" onClick={() => void criar()} disabled={salvando}>
            Criar
          </Button>
        </div>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>

      {initial.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nenhuma biblioteca ainda. Crie a primeira acima.
        </p>
      ) : (
        <ul className="space-y-2">
          {initial.map((b) => (
            <li
              key={b.id}
              className="border rounded-md p-3 flex items-center justify-between gap-3"
            >
              {editandoId === b.id ? (
                <div className="flex flex-1 gap-2">
                  <Input
                    value={nomeEditado}
                    onChange={(e) => setNomeEditado(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void renomear(b.id)}
                    disabled={salvando}
                  >
                    Salvar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditandoId(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <>
                  <Link href={`/bibliotecas/${b.id}`} className="min-w-0 flex-1">
                    <span className="font-medium">{b.name}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      {b.total} {b.total === 1 ? 'livro' : 'livros'}
                    </span>
                  </Link>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditandoId(b.id);
                        setNomeEditado(b.name);
                      }}
                    >
                      Renomear
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void apagar(b)}
                      disabled={salvando}
                    >
                      Apagar
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Link no menu**

Em `components/nav-bar.tsx`, entre o link "Acervo" e o "Quero ter":

```tsx
      <Link
        href="/bibliotecas"
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Bibliotecas
      </Link>
```

- [ ] **Step 4: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build`
Expected: tudo verde; `/bibliotecas` aparece no manifesto do build.

- [ ] **Step 5: Commit**

```bash
git add "app/(main)/bibliotecas/" components/nav-bar.tsx
git commit -m "feat: add collections page with create, rename and delete"
```

---

### Task 7: Uma biblioteca aberta, com selo de não possuído

**Files:**
- Create: `app/(main)/bibliotecas/[id]/page.tsx`
- Modify: `components/cover-badges.tsx`, `components/photo.tsx`, `lib/db/schema.ts`, `lib/db/queries.ts`, `components/grid.tsx`

**Interfaces:**
- Consumes: `fetchCollection`, `fetchCollectionBooks` (Task 2)
- Produces:
```tsx
// components/photo.tsx — prop acrescentada (opcional)
owned?: boolean;
```

- [ ] **Step 1: Selo "Quero ter" no `CoverBadges`**

Em `components/cover-badges.tsx`, trocar a assinatura e o corpo por:

```tsx
export function CoverBadges({
  readStatus,
  myRating,
  owned = true,
}: {
  readStatus: string | null;
  myRating: number | null;
  owned?: boolean;
}) {
  const status = readStatus ? STATUS_LABEL[readStatus] : undefined;
  const nota = myRating === null ? null : Number(myRating);
  if (!status && nota === null && owned) return null;

  return (
    <>
      {/* Numa biblioteca que mistura o que se tem e o que se quer, sem esta
          marca o dono olha a estante sem saber o que de fato possui (AD-3). */}
      {!owned && (
        <span className="absolute right-1 top-1 rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
          Quero ter
        </span>
      )}
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

- [ ] **Step 2: Repassar `owned` pelo `Photo`**

Em `components/photo.tsx`, acrescentar a prop `owned = true` (tipo `owned?: boolean`) à assinatura, e passá-la aos dois `<CoverBadges ... owned={owned} />` — o do caminho com imagem e o do placeholder.

- [ ] **Step 3: `Book` ganha `owned`**

Em `lib/db/schema.ts`:

```ts
export type Book = Pick<
  SelectBook,
  'id' | 'title' | 'image_url' | 'thumbhash' | 'read_status' | 'my_rating' | 'owned'
>;
```

Em `lib/db/queries.ts`, no `select` de `fetchBooksWithPagination`, acrescentar:

```ts
                owned: books.owned,
```

Em `components/grid.tsx`, passar ao `Photo`:

```tsx
        owned={book.owned}
```

- [ ] **Step 4: Criar a página da biblioteca**

`app/(main)/bibliotecas/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Photo } from '@/components/photo';
import { getCurrentUserId } from '@/lib/auth-user';
import { fetchCollection, fetchCollectionBooks } from '@/lib/db/collections';

export default async function BibliotecaPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const collectionId = Number(id);
  if (!Number.isInteger(collectionId) || collectionId <= 0) notFound();

  const userId = await getCurrentUserId();
  const biblioteca = await fetchCollection(userId, collectionId);
  if (!biblioteca) notFound();

  const livros = await fetchCollectionBooks(userId, collectionId);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link href="/bibliotecas">
            <ArrowLeftIcon className="mr-2 h-4 w-4" /> Bibliotecas
          </Link>
        </Button>
        <Link
          href={`/?bib=${collectionId}`}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          Ver no catálogo com filtros
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{biblioteca.name}</h1>
        <p className="text-sm text-gray-500">
          {livros.length} {livros.length === 1 ? 'livro' : 'livros'}
        </p>
      </div>

      {livros.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nenhum livro aqui ainda. Use o modo de seleção no catálogo para
          adicionar vários de uma vez.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {livros.map((livro, index) => (
            <Link
              key={livro.id}
              href={`/${livro.id}`}
              className="block transition ease-in-out md:hover:scale-105"
            >
              <Photo
                src={livro.image_url}
                title={livro.title}
                thumbhash={livro.thumbhash}
                priority={index < 10}
                readStatus={livro.read_status}
                myRating={livro.my_rating}
                owned={livro.owned}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Nota:** esta página **não** reusa `BooksGrid`. A grade do catálogo ganha modo de seleção na Task 8 e passa a exigir props que aqui não fazem sentido; além disso `BooksGrid` esconde livros sem `thumbhash`, o que numa biblioteca curada faria o livro escolhido sumir sem explicação.

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add "app/(main)/bibliotecas/" components/ lib/db/
git commit -m "feat: add collection detail page with wanted badge"
```

---

### Task 8: Modo de seleção múltipla no catálogo

**Files:**
- Modify: `components/grid.tsx`, `app/(main)/page.tsx`

**Interfaces:**
- Consumes: `POST /api/collections/[id]/books` (Task 4), `fetchCollections` (Task 2)
- Produces:
```tsx
// components/grid.tsx
export function BooksGrid({
  books, searchParams, bibliotecas,
}: {
  books: Book[];
  searchParams: SearchParams;
  bibliotecas: { id: number; name: string }[];
}): React.ReactElement;
```

- [ ] **Step 1: Converter a grade em componente de cliente com seleção**

`components/grid.tsx` passa a ser inteiramente client. Conteúdo novo:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Book } from '@/lib/db/schema';
import { Photo } from './photo';
import { Button } from '@/components/ui/button';
import { SearchParams, stringifySearchParams } from '@/lib/url-state';

interface Biblioteca {
  id: number;
  name: string;
}

export function BooksGrid({
  books,
  searchParams,
  bibliotecas,
}: {
  books: Book[];
  searchParams: SearchParams;
  bibliotecas: Biblioteca[];
}) {
  const [selecionando, setSelecionando] = useState(false);
  // A seleção vive só nesta página (AD-5): paginar limpa, e é assim de
  // propósito — estado que sobrevive à navegação falha de formas sutis.
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function alternar(id: number) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function sair() {
    setSelecionando(false);
    setSelecionados(new Set());
    setAviso(null);
  }

  async function adicionar(bibliotecaId: number) {
    if (selecionados.size === 0) return;
    setAviso(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/collections/${bibliotecaId}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookIds: [...selecionados] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAviso(data?.error ?? 'Não foi possível adicionar.');
        return;
      }
      // Repetidos contam zero e isso não é erro (AD-6) — dizer quantos
      // entraram de fato evita a impressão de que a ação falhou.
      const n = Number(data?.adicionados ?? 0);
      setAviso(
        n === 0
          ? 'Esses livros já estavam na biblioteca.'
          : `${n} livro(s) adicionado(s).`
      );
      setSelecionados(new Set());
    } catch {
      setAviso('Falha de rede ao adicionar.');
    } finally {
      setSalvando(false);
    }
  }

  const noFilters = Object.values(searchParams).every((v) => v === undefined);

  return (
    <div>
      {bibliotecas.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          {selecionando ? (
            <Button type="button" variant="outline" size="sm" onClick={sair}>
              Cancelar seleção
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelecionando(true)}
            >
              Selecionar
            </Button>
          )}
          {aviso && <span className="text-sm text-gray-500">{aviso}</span>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
        {!books?.length ? (
          <p className="text-center text-muted-foreground col-span-full">
            Nenhum livro encontrado.
          </p>
        ) : (
          books.map((book, index) => {
            const marcado = selecionados.has(book.id);
            const capa = (
              <Photo
                src={book.image_url}
                title={book.title}
                thumbhash={book.thumbhash}
                priority={index < 10}
                readStatus={book.read_status}
                myRating={book.my_rating}
                owned={book.owned}
              />
            );

            if (selecionando) {
              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => alternar(book.id)}
                  aria-pressed={marcado}
                  className={`relative block rounded-md text-left ${
                    marcado ? 'ring-2 ring-offset-2 ring-sky-600' : ''
                  }`}
                >
                  {capa}
                  <span
                    aria-hidden
                    className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                      marcado
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-white/70 bg-black/40 text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                </button>
              );
            }

            return (
              <Link
                href={`/${book.id}?${stringifySearchParams(searchParams)}`}
                key={book.id}
                className="block transition ease-in-out md:hover:scale-105"
                prefetch={noFilters ? true : null}
              >
                {capa}
              </Link>
            );
          })
        )}
      </div>

      {selecionando && (
        // Barra no rodapé: o uso principal é no celular, onde é o polegar
        // que alcança.
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-3 shadow-lg dark:bg-gray-800">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {selecionados.size} selecionado(s)
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {bibliotecas.map((b) => (
                <Button
                  key={b.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={salvando || selecionados.size === 0}
                  onClick={() => void adicionar(b.id)}
                >
                  {b.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Nota deliberada:** o `BookLink` antigo devolvia `null` quando o livro não tinha `thumbhash`, escondendo livros do catálogo sem aviso. Isso some aqui: `Photo` já trata `thumbhash` nulo, e esconder livro é pior que exibir sem desfoque.

- [ ] **Step 2: Passar as bibliotecas na página do catálogo**

Em `app/(main)/page.tsx`, importar `fetchCollections` e incluí-la no `Promise.all`:

```tsx
  const [books, estimatedTotal, bibliotecas] = await Promise.all([
    fetchBooksWithPagination(userId, parsedSearchParams),
    estimateTotalBooks(userId, parsedSearchParams),
    fetchCollections(userId),
  ]);
```

e repassar à grade:

```tsx
        <BooksGrid
          books={books}
          searchParams={parsedSearchParams}
          bibliotecas={bibliotecas}
        />
```

- [ ] **Step 3: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build`
Expected: tudo verde.

- [ ] **Step 4: Commit**

```bash
git add components/grid.tsx "app/(main)/page.tsx"
git commit -m "feat: add multi-select mode to add books to collections"
```

---

### Task 9: Etiquetas na página do livro

**Files:**
- Create: `app/(main)/[id]/book-collections.tsx`
- Modify: `lib/db/queries.ts`, `app/(main)/[id]/page.tsx`
- Test: `test/db/collections-queries.test.ts` (acrescentar caso)

**Interfaces:**
- Consumes: rotas das Tasks 3 e 4
- Produces: `fetchBookById` passa a devolver `collections: { id: number; name: string }[]`

- [ ] **Step 1: Acrescentar o teste que falha**

Em `test/db/collections-queries.test.ts`, acrescentar:

```ts
describe('bibliotecas na página do livro', () => {
  it('fetchBookById traz as bibliotecas do livro', async () => {
    const [b] = await ctx.sql`
      select id from books where title = 'It' limit 1`;
    const { fetchBookById } = await import('@/lib/db/queries');
    const livro = await fetchBookById(userId, String(b.id));
    expect(livro.collections).toEqual([{ id: terror, name: 'Terror' }]);
  });

  it('livro sem biblioteca devolve lista vazia, não null', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${userId}, 'Solto', 'Solto') returning id`;
    const { fetchBookById } = await import('@/lib/db/queries');
    const livro = await fetchBookById(userId, String(b.id));
    expect(livro.collections).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/collections-queries.test.ts`
Expected: FAIL — `collections` não existe no resultado.

- [ ] **Step 3: Agregar as bibliotecas em `fetchBookById`**

Em `lib/db/queries.ts`, dentro do `select` de `fetchBookById`, acrescentar:

```ts
                // Subconsulta em vez de mais um leftJoin: a query já agrega
                // autores com array_agg, e um segundo join multiplicaria as
                // linhas, duplicando os autores de quem está em duas
                // bibliotecas.
                collections: sql<{ id: number; name: string }[]>`coalesce((
                    select json_agg(json_build_object('id', c.id, 'name', c.name)
                                    order by c.name)
                    from book_collections bc
                    join collections c on c.id = bc.collection_id
                    where bc.book_id = ${books.id}
                ), '[]'::json)`,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/db/collections-queries.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Criar o componente de etiquetas**

`app/(main)/[id]/book-collections.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface Biblioteca {
  id: number;
  name: string;
}

export function BookCollections({
  bookId,
  atuais,
  todas,
}: {
  bookId: number;
  atuais: Biblioteca[];
  todas: Biblioteca[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pertence = new Set(atuais.map((b) => b.id));

  async function alternar(bibliotecaId: number, jaPertence: boolean) {
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/collections/${bibliotecaId}/books`, {
        method: jaPertence ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookIds: [bookId] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível salvar.');
        return;
      }
      router.refresh();
    } catch {
      setErro('Falha de rede ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {atuais.length === 0 ? (
          <span className="text-sm text-gray-500">Nenhuma biblioteca</span>
        ) : (
          atuais.map((b) => (
            <Link
              key={b.id}
              href={`/bibliotecas/${b.id}`}
              className="rounded-full bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              {b.name}
            </Link>
          ))
        )}
        {todas.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditando((v) => !v)}
          >
            {editando ? 'Fechar' : 'Editar'}
          </Button>
        )}
      </div>

      {editando && (
        <div className="flex flex-wrap gap-2 rounded-md border p-3">
          {todas.map((b) => {
            const dentro = pertence.has(b.id);
            return (
              <Button
                key={b.id}
                type="button"
                size="sm"
                variant={dentro ? 'default' : 'outline'}
                disabled={salvando}
                onClick={() => void alternar(b.id, dentro)}
              >
                {dentro ? `✓ ${b.name}` : b.name}
              </Button>
            );
          })}
        </div>
      )}

      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Renderizar na página do livro**

Em `app/(main)/[id]/page.tsx`, importar:

```tsx
import { fetchCollections } from '@/lib/db/collections';
import { BookCollections } from './book-collections';
```

buscar as bibliotecas junto do livro:

```tsx
  const [book, bibliotecas] = await Promise.all([
    fetchBookById(userId, params.id),
    fetchCollections(userId),
  ]);
  if (!book) notFound();
```

e renderizar logo abaixo do bloco de série:

```tsx
          <BookCollections
            bookId={book.id}
            atuais={book.collections}
            todas={bibliotecas.map((b) => ({ id: b.id, name: b.name }))}
          />
```

- [ ] **Step 7: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build`
Expected: tudo verde.

- [ ] **Step 8: Commit**

```bash
git add lib/db/queries.ts "app/(main)/[id]/" test/
git commit -m "feat: show and edit book collections on the book page"
```

---

## Notas de execução

**Ordem obrigatória:** 1 → 2 → 3 → 4. Depois, 5 a 9 dependem das quatro primeiras mas são independentes entre si, com uma exceção: a **Task 8 depende da Task 7** (a prop `owned` do `Photo` e o campo `owned` em `Book` nascem lá).

**Etapa manual, depois do código:** `pnpm db:migrate` para aplicar a `0012`. Nenhum re-import do Calibre é necessário — esta entrega não toca em metadados de livro.

**A Task 1 carrega o item de segurança.** O teste que verifica a policy de `book_collections` citando `collections` **e** `books` é o que prova o AD-7. Se ele não passar, não mergear.

**Pendência herdada, ainda em aberto:** a RLS só terá efeito em produção quando a aplicação conectar como `book_app` em vez de `postgres`. As policies desta entrega nascem corretas e inertes, como as demais.

**Fora de escopo, registrado:** botão "adicionar todo o resultado do filtro atual"; seleção sobrevivendo à paginação; ordenar livros à mão dentro da biblioteca; capa/cor/descrição de biblioteca; bibliotecas aninhadas; compartilhamento; aposentar o campo `genre`.

**Próxima spec já acordada:** painel e progresso de leitura — destaque do que está sendo lido, progresso por página/percentual na página do livro, e contagem por período (ano/mês, páginas).
