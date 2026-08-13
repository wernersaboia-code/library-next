# Reescopo para Rastreador Pessoal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Book Inventory num rastreador pessoal de leitura estilo StoryGraph — sem Google, sem Drive, sem leitor — com login e-mail/senha via Supabase Auth e ingestão pelo Calibre.

**Architecture:** Next.js 15 App Router. Postgres (Supabase) via Drizzle/postgres-js, com isolamento por `withUser` + `app.user_id` (RLS) inalterado desde a Fundação. A identidade passa a vir do Supabase Auth (e-mail/senha) em vez do Google; `app_users.id` = uid do Supabase. A camada Drive/leitor/tradução é removida; o núcleo (schema, RLS, import do Calibre, catálogo, busca) é preservado e ganha as telas de tracking.

**Tech Stack:** Next.js 15.5, React 19, TypeScript 5.5 (strict), Drizzle 0.33 + postgres-js, @supabase/ssr + @supabase/supabase-js, Vitest, ESLint, GitHub Actions.

## Global Constraints

- **Spec de referência:** `docs/superpowers/specs/2026-08-13-tracker-reshape-design.md`. Divergência → a spec vence; pare e pergunte.
- **Base:** branch a partir de `main` (que já contém a Fundação: migrations até 0007, RLS, import do Calibre).
- **Todo acesso a dados do usuário passa por `withUser`.** Nenhuma query de `books`/`highlights`/`authors`(escrita) fora dele. As policies de RLS da migration `0007` **não mudam**.
- **`app_users.id` = uid do Supabase Auth.** A linha é garantida por `ensureAppUser` no login.
- **Zero Google / zero Drive / zero leitor.** Nenhum import de `next-auth`, `epubjs`, `react-pdf`, `fast-xml-parser` deve sobrar.
- **Dicionário full-text: `portuguese`.** Nenhum `!` non-null assertion (ESLint `error`, gate bloqueante). Mensagens de UI/erro em português; código em inglês.
- **`git` neste repo:** exportar antes de qualquer git — `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'`. Nunca `git config --global`.
- **Segredos:** nunca imprimir `.env`/`.env.test`. Testes de banco usam `requireTestDatabaseUrl()` de `test/setup.ts`, isolados por schema (`test/helpers/db.ts`).
- **CI:** `pnpm typecheck` + `pnpm lint` + `pnpm test:run` seguem gates bloqueantes.

---

## File Structure

**Criados**

| Arquivo | Responsabilidade |
|---|---|
| `lib/supabase/server.ts` | Cliente Supabase server-side (cookies via `@supabase/ssr`) |
| `lib/supabase/client.ts` | Cliente Supabase browser-side (login form) |
| `lib/auth-user.ts` | `getCurrentUserId()`, `getCurrentUser()`, `ensureAppUser()`, `AuthError` |
| `lib/authors.ts` | `authorId(name)` (realocado de `lib/import-book.ts`) |
| `app/(main)/[id]/tracking-controls.tsx` | Client component: status, datas, avaliação pessoal |
| `app/(main)/[id]/notes-section.tsx` | Client component: CRUD de notas do livro |
| `app/api/books/[id]/route.ts` | `PATCH` status/datas/rating |
| `app/api/books/[id]/notes/route.ts` | `GET/POST/PATCH/DELETE` notas |
| `lib/db/migrations/0008_*.sql` | Dropar tabelas mortas; colunas de tracking; podar `highlights` |
| `test/api/books.test.ts` | Testes das rotas de tracking e notas |
| `test/auth/auth-user.test.ts` | Testes de `getCurrentUserId`/`ensureAppUser` |

**Modificados**

| Arquivo | Mudança |
|---|---|
| `lib/db/schema.ts` | Remover tabelas mortas; `books` ganha `my_rating`/`date_started`/`date_finished`; `highlights` vira notas |
| `lib/db/queries.ts` | Consumidores usam `getCurrentUserId` de `lib/auth-user` |
| `middleware.ts` | Sessão Supabase no lugar do NextAuth |
| `app/login/page.tsx` | Formulário e-mail/senha |
| `app/(main)/layout.tsx` / `nav-bar.tsx` | Botão de logout Supabase; sem `SessionProvider` |
| `app/(main)/[id]/page.tsx` | Integrar tracking-controls + notes-section; sem `!` |
| `app/api/reading/stats/route.ts` | Só `read_status`/`date_finished`; sem tabelas dropadas |
| `lib/db/import-calibre.ts` | `resolveUserId` casa com a conta Supabase; `authorId` de `lib/authors` |
| `lib/storage.ts` | Remover `uploadBookFile`/`createSignedUrl`/`BOOKS_BUCKET` |
| `package.json` | −`next-auth`,−`epubjs`,−`react-pdf`,−`fast-xml-parser`; +`@supabase/ssr` |

**Deletados**

`lib/auth.ts`, `lib/auth-tokens.ts`, `lib/drive.ts`, `lib/ebook.ts`, `lib/pdf-meta.ts`, `lib/import-book.ts`, `lib/rate-limit.ts`, `app/api/auth/[...nextauth]/`, `app/api/drive/`, `app/api/translate/`, `app/api/reading/heartbeat/`, `app/api/reading/progress/`, `app/api/reading/annotations/`, `app/read/`, `components/annotations-panel.tsx`, `components/translation-popup.tsx`, `components/session-provider.tsx`, e os testes de features removidas (`test/import/`, `test/api/read.test.ts`, `test/rate-limit.test.ts`, `test/storage.test.ts` para as funções removidas, `test/auth/refresh.test.ts`, `test/auth/allowlist.test.ts`).

---

### Task 1: Purga da camada Drive/leitor/tradução + tabelas mortas

Remove tudo que só servia para ler arquivos ou falar com Google/Drive, e dropa as tabelas sem consumidor. Mantém o login Google temporariamente (sai na Task 2) para o app continuar compilando.

**Files:**
- Delete: (lista acima, seção Deletados — exceto `lib/auth.ts`/`lib/auth-tokens.ts`/`session-provider`, que saem na Task 2)
- Create: `lib/authors.ts`
- Modify: `lib/db/schema.ts`, `lib/storage.ts`, `lib/db/import-calibre.ts`, `app/api/reading/stats/route.ts`, `app/(main)/[id]/page.tsx`, `package.json`
- Create: `lib/db/migrations/0008_drop_reader_tables.sql`

**Interfaces:**
- Consumes: nada novo
- Produces: `authorId(name: string): string` em `lib/authors.ts`

- [ ] **Step 1: Realocar `authorId`**

Criar `lib/authors.ts` copiando a função `authorId` de `lib/import-book.ts` verbatim:

```ts
/** Id determinístico e estável — a mesma grafia sempre gera o mesmo id. */
export function authorId(name: string): string {
  return (
    name.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      .slice(0, 50) || 'desconhecido'
  );
}
```

- [ ] **Step 2: Apontar o import do Calibre para o novo módulo**

Em `lib/db/import-calibre.ts`, trocar `import { authorId } from './import-book'` (ou `@/lib/import-book`) por `import { authorId } from '@/lib/authors'`.

- [ ] **Step 3: Deletar os arquivos da camada removida**

```bash
git rm -r app/api/drive app/api/translate app/api/reading/heartbeat \
  app/api/reading/progress app/api/reading/annotations app/read \
  lib/drive.ts lib/ebook.ts lib/pdf-meta.ts lib/import-book.ts lib/rate-limit.ts \
  components/annotations-panel.tsx components/translation-popup.tsx \
  test/import test/api/read.test.ts test/rate-limit.test.ts
```

- [ ] **Step 4: Podar `lib/storage.ts`**

Remover `uploadBookFile`, `createSignedUrl`, `BOOKS_BUCKET` e o helper `isQuota` se ficar sem uso pelo `uploadBookFile` (mantê-lo se `uploadCover` ainda usa). Manter `uploadCover`, `COVERS_BUCKET`, `StorageQuotaError`. Ajustar `test/storage.test.ts` removendo os testes de `uploadBookFile`/`createSignedUrl`.

- [ ] **Step 5: Remover as tabelas mortas do schema**

Em `lib/db/schema.ts`, remover as definições de `driveFiles`, `driveSettings`, `apiUsage`, `readingProgress`, `readingSessions` e quaisquer `relations`/tipos que as referenciem. Remover imports órfãos.

- [ ] **Step 6: Migration que dropa as tabelas**

Criar `lib/db/migrations/0008_drop_reader_tables.sql`:

```sql
DROP TABLE IF EXISTS "reading_sessions";
DROP TABLE IF EXISTS "reading_progress";
DROP TABLE IF EXISTS "api_usage";
DROP TABLE IF EXISTS "drive_files";
DROP TABLE IF EXISTS "drive_settings";
```

Registrar no `_journal.json` (idx 8, seguindo o padrão das entradas existentes) e rodar `pnpm db:generate` para confirmar sincronia (`No schema changes` para o resto). Se o drizzle-kit quiser gerar a própria migration de drop, use-a no lugar da manual — o importante é o schema e as migrations ficarem consistentes.

- [ ] **Step 7: Simplificar `stats` para não usar tabelas dropadas**

Reescrever `app/api/reading/stats/route.ts` para computar só a partir de `books`, dentro de `withUser` (segue o padrão da Fundação — `getCurrentUserId` + `withUser`):

```ts
import { getCurrentUserId } from '@/lib/auth';   // ainda NextAuth nesta task; muda na Task 2
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import { sql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const data = await withUser(userId, async (tx) => {
      const one = (where?: ReturnType<typeof eq>) =>
        tx.select({ n: sql<number>`count(*)` }).from(books)
          .where(where).then((r) => Number(r[0].n));
      const totalBooks = await one();
      const lendo = await one(eq(books.read_status, 'lendo'));
      const lidos = await one(eq(books.read_status, 'lido'));
      const paginasLidas = await tx
        .select({ t: sql<number>`coalesce(sum(${books.num_pages}),0)` })
        .from(books).where(eq(books.read_status, 'lido'))
        .then((r) => Number(r[0].t));
      return { totalBooks, lendo, lidos, paginasLidas };
    });
    return NextResponse.json({
      ...data, naoLidos: data.totalBooks - data.lendo - data.lidos,
    });
  } catch (err) {
    return errorResponse(err, 'Erro ao calcular estatísticas');
  }
}
```

(Os lidos-por-ano entram na Task 6, junto com `date_finished`.)

- [ ] **Step 8: Limpar a página do livro do que era do leitor**

Em `app/(main)/[id]/page.tsx`, remover o botão/links "Ler" e qualquer import de `driveFiles`/leitor. Deixar só o catálogo/detalhe. (Os controles de tracking entram na Task 4.)

- [ ] **Step 9: Remover dependências mortas**

```bash
pnpm remove epubjs react-pdf fast-xml-parser
```

(`next-auth` sai na Task 2.)

- [ ] **Step 10: Verificar build e testes**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: typecheck limpo, lint 0 erros, todos os testes restantes passam. `grep -rn "drive\|epub\|react-pdf\|/read/" app lib components` não retorna código vivo.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: remove drive/reader/translation layer and dead tables"
```

---

### Task 2: Trocar autenticação para Supabase Auth (e-mail/senha)

Substitui NextAuth-Google por Supabase Auth. A RLS/`withUser` não muda; só a fonte de identidade.

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/auth-user.ts`, `test/auth/auth-user.test.ts`
- Delete: `lib/auth.ts`, `lib/auth-tokens.ts`, `app/api/auth/[...nextauth]/`, `components/session-provider.tsx`, `test/auth/refresh.test.ts`, `test/auth/allowlist.test.ts`
- Modify: `middleware.ts`, `app/login/page.tsx`, `app/(main)/layout.tsx`, `components/nav-bar.tsx`, `app/api/reading/stats/route.ts` e todo consumidor de `getCurrentUserId`/`getDriveToken`, `package.json`

**Interfaces:**
- Consumes: `withUser` (Fundação); `appUsers` (schema)
- Produces:
  - `getCurrentUserId(): Promise<string>` — uid do Supabase; lança `AuthError` sem sessão
  - `getCurrentUser(): Promise<{ id: string; email: string }>`
  - `ensureAppUser(id: string, email: string): Promise<void>` — upsert idempotente em `app_users`
  - `class AuthError extends Error`

- [ ] **Step 1: Instalar `@supabase/ssr`**

```bash
pnpm add @supabase/ssr
```

- [ ] **Step 2: Clientes Supabase**

`lib/supabase/server.ts`:

```ts
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options));
          } catch {
            // chamada de Server Component: ignora (o middleware renova)
          }
        },
      },
    }
  );
}
```

`lib/supabase/client.ts`:

```ts
'use client';
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  );
}
```

Adicionar ao `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (a anon key é pública por design; o `SUPABASE_SERVICE_ROLE_KEY` continua só server-side).

- [ ] **Step 3: Teste de `ensureAppUser`/`getCurrentUserId`**

`test/auth/auth-user.test.ts` (mocka o cliente Supabase; usa `createTestDb` para `ensureAppUser`):

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(() => ctx.cleanup());

describe('ensureAppUser', () => {
  it('cria a linha app_users com id = uid do Supabase', async () => {
    vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
    const { ensureAppUser } = await import('@/lib/auth-user');
    const uid = '11111111-1111-1111-1111-111111111111';
    await ensureAppUser(uid, 'a@b.com');
    await ensureAppUser(uid, 'a@b.com'); // idempotente
    const rows = await ctx.sql`select id, email from app_users where id = ${uid}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('a@b.com');
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm test:run test/auth/auth-user.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth-user'`

- [ ] **Step 5: Implementar `lib/auth-user.ts`**

```ts
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { appUsers } from '@/lib/db/schema';
import { createClient } from '@/lib/supabase/server';

export class AuthError extends Error {
  constructor(message = 'Não autenticado') {
    super(message);
    this.name = 'AuthError';
  }
}

export async function ensureAppUser(id: string, email: string): Promise<void> {
  await db.insert(appUsers).values({ id, email })
    .onConflictDoNothing({ target: appUsers.id });
}

export async function getCurrentUser(): Promise<{ id: string; email: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) throw new AuthError();
  return { id: data.user.id, email: data.user.email };
}

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm test:run test/auth/auth-user.test.ts`
Expected: PASS

- [ ] **Step 7: Middleware com sessão Supabase**

`middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)),
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return res;
}

export const config = {
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 8: Página de login e-mail/senha**

`app/login/page.tsx` (client component com o form; sem cadastro público):

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email, password: senha,
    });
    if (error) { setErro('E-mail ou senha inválidos.'); return; }
    // garante a linha app_users antes de qualquer query com FK
    await fetch('/api/auth/ensure', { method: 'POST' });
    router.replace('/');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-black">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md dark:bg-gray-800 space-y-4">
        <h1 className="text-center text-2xl font-bold">Book Inventory</h1>
        <input type="email" required placeholder="E-mail" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border p-2 dark:bg-gray-700" />
        <input type="password" required placeholder="Senha" value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full rounded border p-2 dark:bg-gray-700" />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button type="submit"
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700">
          Entrar
        </button>
      </form>
    </div>
  );
}
```

Criar `app/api/auth/ensure/route.ts` (garante `app_users` após login):

```ts
import { NextResponse } from 'next/server';
import { getCurrentUser, ensureAppUser } from '@/lib/auth-user';
import { errorResponse } from '@/lib/errors';

export async function POST() {
  try {
    const { id, email } = await getCurrentUser();
    await ensureAppUser(id, email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao inicializar a conta');
  }
}
```

- [ ] **Step 9: Trocar todos os consumidores de identidade**

`grep -rn "from '@/lib/auth'" app lib` → em cada um, trocar o import de `getCurrentUserId` para `@/lib/auth-user`. Remover qualquer uso de `getDriveToken` (já não deve haver após a Task 1). Atualizar `app/(main)/layout.tsx` para remover `SessionProvider`; o logout vira um botão client que chama `supabase.auth.signOut()` e redireleciona a `/login` (adicionar em `components/nav-bar.tsx`).

- [ ] **Step 10: Deletar o NextAuth**

```bash
git rm lib/auth.ts lib/auth-tokens.ts components/session-provider.tsx \
  test/auth/refresh.test.ts test/auth/allowlist.test.ts
git rm -r app/api/auth/'[...nextauth]'
pnpm remove next-auth
```

- [ ] **Step 11: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: tudo verde. `grep -rn "next-auth\|@/lib/auth'" app lib components` retorna vazio.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: replace google login with supabase email/password auth"
```

---

### Task 3: Schema de tracking

Adiciona os campos de tracking em `books` e converte `highlights` em notas.

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0009_tracking.sql`, `test/db/tracking-schema.test.ts`

**Interfaces:**
- Consumes: schema
- Produces: colunas `books.my_rating`/`date_started`/`date_finished`; `highlights` com `kind ∈ {'note','quote'}`

- [ ] **Step 1: Teste do schema**

`test/db/tracking-schema.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;
beforeAll(async () => {
  ctx = await createTestDb();
  const [u] = await ctx.sql`insert into app_users (email) values ('t@b.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

describe('tracking schema', () => {
  it('aceita my_rating entre 1 e 5 e recusa fora do intervalo', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'L', 'L', 4) returning id`;
    expect(b.id).toBeDefined();
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'X', 'X', 9)`).rejects.toThrow(/check/i);
  });

  it('guarda datas de leitura', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, date_started, date_finished)
      values (${userId}, 'D', 'D', '2026-01-01', '2026-02-01') returning id, date_finished`;
    expect(String(b.date_finished)).toContain('2026-02-01');
  });

  it('highlights aceita kind note/quote e recusa outro', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source) values (${userId},'N','N') returning id`;
    await ctx.sql`insert into highlights (user_id, book_id, kind, text_content, note)
      values (${userId}, ${b.id}, 'quote', 'trecho', 'meu comentário')`;
    await expect(ctx.sql`insert into highlights (user_id, book_id, kind)
      values (${userId}, ${b.id}, 'bookmark')`).rejects.toThrow(/check/i);
  });

  it('busca de notas em português continua funcionando', async () => {
    const rows = await ctx.sql`
      select id from highlights
      where search_tsv @@ websearch_to_tsquery('portuguese', 'comentário')`;
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/tracking-schema.test.ts`
Expected: FAIL — colunas não existem / check antigo de `kind`.

- [ ] **Step 3: Atualizar `lib/db/schema.ts`**

Em `books`, acrescentar:

```ts
my_rating: integer('my_rating'),
date_started: date('date_started'),
date_finished: date('date_finished'),
```

(importar `date` de `drizzle-orm/pg-core`). Em `highlights`, remover as colunas `locator`, `progress`, `contextBefore`, `contextAfter`, `noteUpdatedAt` e o tipo `Locator`. Manter `textContent`, `note`, `kind`, `color`, `searchTsv`.

- [ ] **Step 4: Migration**

Criar `lib/db/migrations/0009_tracking.sql`:

```sql
ALTER TABLE "books" ADD COLUMN "my_rating" integer;
ALTER TABLE "books" ADD COLUMN "date_started" date;
ALTER TABLE "books" ADD COLUMN "date_finished" date;
ALTER TABLE "books" ADD CONSTRAINT "books_my_rating_range"
  CHECK ("my_rating" BETWEEN 1 AND 5);

ALTER TABLE "highlights" DROP COLUMN IF EXISTS "locator";
ALTER TABLE "highlights" DROP COLUMN IF EXISTS "progress";
ALTER TABLE "highlights" DROP COLUMN IF EXISTS "context_before";
ALTER TABLE "highlights" DROP COLUMN IF EXISTS "context_after";
ALTER TABLE "highlights" DROP COLUMN IF EXISTS "note_updated_at";

ALTER TABLE "highlights" DROP CONSTRAINT IF EXISTS "highlights_kind_check";
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_kind_check"
  CHECK ("kind" IN ('note','quote'));
```

Registrar no `_journal.json` (idx 9). Rodar `pnpm db:generate` e conferir sincronia.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test:run test/db/tracking-schema.test.ts && pnpm typecheck`
Expected: PASS; typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/ test/db/tracking-schema.test.ts
git commit -m "feat: add tracking columns and convert highlights to notes"
```

---

### Task 4: API + UI de status, datas e avaliação

**Files:**
- Create: `app/api/books/[id]/route.ts`, `app/(main)/[id]/tracking-controls.tsx`, `test/api/books.test.ts`
- Modify: `app/(main)/[id]/page.tsx`, `lib/db/queries.ts` (o `fetchBookById` deve devolver `my_rating`/datas)

**Interfaces:**
- Consumes: `getCurrentUserId` (Task 2), `withUser` (Fundação)
- Produces: `PATCH /api/books/[id]` aceitando `{ readStatus?, dateStarted?, dateFinished?, myRating? }`

- [ ] **Step 1: Teste da rota (mock de auth+withUser, padrão de `test/api`)**

`test/api/books.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: (tx: unknown) => unknown) => run(fn)),
}));

async function PATCH(id: string, body: unknown) {
  const mod = await import('@/app/api/books/[id]/route');
  return mod.PATCH(
    new Request(`http://x/api/books/${id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => { vi.clearAllMocks(); run.mockResolvedValue([{ id: 1 }]); });

describe('PATCH /api/books/[id]', () => {
  it('atualiza status dentro de withUser', async () => {
    const res = await PATCH('1', { readStatus: 'lido' });
    expect(res.status).toBe(200);
    const { withUser } = await import('@/lib/db/with-user');
    expect(withUser).toHaveBeenCalledWith('u-1', expect.any(Function));
  });

  it('recusa my_rating fora de 1..5', async () => {
    const res = await PATCH('1', { myRating: 9 });
    expect(res.status).toBe(400);
  });

  it('recusa read_status inválido', async () => {
    const res = await PATCH('1', { readStatus: 'talvez' });
    expect(res.status).toBe(400);
  });

  it('recusa id não numérico', async () => {
    const res = await PATCH('abc', { readStatus: 'lido' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/api/books.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `app/api/books/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';

const STATUS = new Set(['lido', 'lendo', 'não lido']);

export async function PATCH(
  req: Request, { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const bookId = Number((await params).id);
    if (!Number.isInteger(bookId) || bookId <= 0)
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });

    const body = await req.json();
    const set: Record<string, unknown> = {};

    if (body.readStatus !== undefined) {
      if (!STATUS.has(body.readStatus))
        return NextResponse.json({ error: 'status inválido' }, { status: 400 });
      set.read_status = body.readStatus;
    }
    if (body.myRating !== undefined && body.myRating !== null) {
      const r = Number(body.myRating);
      if (!Number.isInteger(r) || r < 1 || r > 5)
        return NextResponse.json({ error: 'avaliação deve ser 1..5' }, { status: 400 });
      set.my_rating = r;
    }
    if (body.myRating === null) set.my_rating = null;
    if (body.dateStarted !== undefined) set.date_started = body.dateStarted || null;
    if (body.dateFinished !== undefined) set.date_finished = body.dateFinished || null;

    if (Object.keys(set).length === 0)
      return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });

    const rows = await withUser(userId, (tx) =>
      tx.update(books).set(set).where(eq(books.id, bookId)).returning({ id: books.id }));

    if (rows.length === 0)
      return NextResponse.json({ error: 'livro não encontrado' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao atualizar o livro');
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/api/books.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: `fetchBookById` devolve os campos novos**

Em `lib/db/queries.ts`, adicionar ao select de `fetchBookById`: `my_rating: books.my_rating`, `date_started: books.date_started`, `date_finished: books.date_finished`.

- [ ] **Step 6: Client component de controles**

`app/(main)/[id]/tracking-controls.tsx` — select de status, dois inputs `type="date"`, e 5 estrelas para `my_rating`; cada mudança dá `PATCH /api/books/${id}` e um `router.refresh()`. Estados de UI em português. (Componente client; recebe `bookId`, `initial` via props do server component.)

- [ ] **Step 7: Integrar na página**

Em `app/(main)/[id]/page.tsx`, renderizar `<TrackingControls bookId={book.id} initial={{ readStatus: book.read_status, dateStarted: book.date_started, dateFinished: book.date_finished, myRating: book.my_rating }} />`. Sem `!`.

- [ ] **Step 8: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: tudo verde.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: edit reading status, dates and personal rating from the book page"
```

---

### Task 5: API + UI de notas

**Files:**
- Create: `app/api/books/[id]/notes/route.ts`, `app/(main)/[id]/notes-section.tsx`
- Modify: `test/api/books.test.ts` (acrescentar casos de notas), `app/(main)/[id]/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUserId`, `withUser`, `highlights`
- Produces: `GET/POST/PATCH/DELETE /api/books/[id]/notes`

- [ ] **Step 1: Testes das notas** (acrescentar a `test/api/books.test.ts`)

Cobrir: `POST` cria nota dentro de `withUser`; `DELETE` sem id → 400; `POST` com `kind` inválido → 400; todas passam por `withUser` com `'u-1'`. Seguir o mesmo padrão de mock do Step 1 da Task 4.

```ts
describe('POST /api/books/[id]/notes', () => {
  it('cria nota dentro de withUser', async () => {
    run.mockResolvedValue([{ id: 'n-1' }]);
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.POST(
      new Request('http://x/api/books/1/notes', {
        method: 'POST',
        body: JSON.stringify({ kind: 'quote', textContent: 't', note: 'c' }),
      }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const { withUser } = await import('@/lib/db/with-user');
    expect(withUser).toHaveBeenCalledWith('u-1', expect.any(Function));
  });

  it('recusa kind inválido', async () => {
    const mod = await import('@/app/api/books/[id]/notes/route');
    const res = await mod.POST(
      new Request('http://x/api/books/1/notes', {
        method: 'POST', body: JSON.stringify({ kind: 'bookmark' }),
      }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/api/books.test.ts`
Expected: FAIL — rota de notas não existe.

- [ ] **Step 3: Implementar `app/api/books/[id]/notes/route.ts`**

`GET` lista as notas do livro (em `withUser`); `POST` cria (`kind ∈ {note,quote}`, valida); `PATCH` edita `note`/`textContent` por `id`; `DELETE` remove por `id`. Todos em `withUser` — o RLS garante posse. Validar `kind` contra `new Set(['note','quote'])` e responder 400 caso contrário. Usar `errorResponse` no catch. (Estrutura idêntica ao padrão das rotas da Fundação; sem `!`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/api/books.test.ts`
Expected: PASS.

- [ ] **Step 5: UI de notas**

`app/(main)/[id]/notes-section.tsx` — client component: lista as notas (busca via `GET`), formulário para adicionar (citação opcional + comentário), editar e apagar, cada ação chamando a rota e dando `router.refresh()`. Renderizar `<NotesSection bookId={book.id} />` na página do livro.

- [ ] **Step 6: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: per-book notes (create, edit, delete) on the book page"
```

---

### Task 6: Estatísticas do rastreador

Completa o `stats` com lidos-por-ano a partir de `date_finished`.

**Files:**
- Modify: `app/api/reading/stats/route.ts`, `components/dashboard.tsx`
- Create: `test/api/stats.test.ts`

**Interfaces:**
- Consumes: `getCurrentUserId`, `withUser`, `books`
- Produces: resposta com `{ totalBooks, lendo, lidos, naoLidos, paginasLidas, porAno: { [ano]: number } }`

- [ ] **Step 1: Teste de stats** (com `createTestDb`, populando `read_status` e `date_finished`)

Provar: contagens corretas; `paginasLidas` soma só os lidos; `porAno` agrupa por ano de `date_finished`. Rodar sob dois anos distintos para validar o agrupamento.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/api/stats.test.ts`
Expected: FAIL — `porAno` ausente.

- [ ] **Step 3: Acrescentar `porAno` ao `stats`**

Dentro do `withUser`, adicionar:

```ts
const porAnoRows = await tx
  .select({
    ano: sql<string>`extract(year from ${books.date_finished})::text`,
    n: sql<number>`count(*)`,
  })
  .from(books)
  .where(sql`${books.date_finished} is not null`)
  .groupBy(sql`extract(year from ${books.date_finished})`);
const porAno = Object.fromEntries(porAnoRows.map((r) => [r.ano, Number(r.n)]));
```

e incluir `porAno` na resposta.

- [ ] **Step 4: Mostrar no dashboard**

Em `components/dashboard.tsx`, exibir os cards existentes + uma linha "lidos por ano". Sem `!`.

- [ ] **Step 5: Verificar e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`

```bash
git add -A
git commit -m "feat: reading stats by year from finished dates"
```

---

### Task 7: Import do Calibre sob a identidade Supabase

**Files:**
- Modify: `lib/db/import-calibre.ts`
- Modify: `test/import-calibre.test.ts` (novo caminho — o antigo `test/import/` foi removido na Task 1; criar `test/import-calibre.test.ts`)

**Interfaces:**
- Consumes: `authorId` (`lib/authors`), `uploadCover`, `withUser`, `appUsers`
- Produces: `resolveUserId(email)` que casa com a conta Supabase existente

- [ ] **Step 1: Teste de `resolveUserId`**

`test/import-calibre.test.ts` (com `createTestDb`): dado um `app_users` já criado (como no login), `resolveUserId(email)` devolve o id existente; e-mail sem linha correspondente → cria; e-mail vazio → erro em português.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/import-calibre.test.ts`
Expected: FAIL conforme o estado atual da função.

- [ ] **Step 3: Ajustar `resolveUserId`**

Confirmar que `resolveUserId(email)` faz `insert ... onConflictDoNothing` por e-mail e re-seleciona o id — assim casa com a linha que o login (`ensureAppUser`) já criou, em vez de gerar identidade nova. Manter `authorId` de `@/lib/authors`, `uploadCover`, `withUser`, `client.end()` no `finally` (já presentes da Fundação).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/import-calibre.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar tudo e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`

```bash
git add -A
git commit -m "feat: calibre import resolves the supabase account"
```

---

## Notas de execução

**Ordem obrigatória:** 1 → 2 antes de tudo (removem e trocam a base). Depois 3 (schema), então 4, 5, 6 (usam as colunas novas) e 7 por último.

**Etapa manual (com o usuário), após o código:**
- Criar a conta no painel do Supabase (Authentication → Add user) — a conta única do dono.
- Definir `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no `.env`/deploy.
- Fazer login uma vez (cria a linha `app_users`), depois `pnpm db:migrate` e `pnpm db:import-calibre --email=<conta>` na máquina com o Calibre.
- Corte de produção da RLS (herdado da Fundação, ainda pendente): `book_app` com senha e `POSTGRES_URL` apontando para ele.

**Fora de escopo, registrado:** biblioteca de destaques cross-livro com busca/rev. espaçada; compartilhamento somente-leitura do catálogo; leitor de arquivos.
