# Painel e progresso de leitura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar onde o dono está em cada livro, destacar o que ele está lendo numa faixa no topo do catálogo, e contar o que foi lido no mês e no ano — com dados que nasçam corretos.

**Architecture:** Três colunas em `books` (`progress_percent`, `progress_updated_at`, `dnf_reason`) e o quarto status `abandonado`; nenhuma tabela nova. O percentual é a fonte da verdade e a página é apenas forma de entrada. A rota `PATCH /api/books/[id]`, que já atende o acompanhamento, ganha as transições automáticas de status.

**Tech Stack:** Next.js 15.5, React 19, TypeScript 5.5 (strict), Drizzle + postgres-js, Vitest, ESLint.

## Global Constraints

- **Spec de referência:** `docs/superpowers/specs/2026-08-14-painel-e-progresso-de-leitura-design.md`. Divergência → a spec vence; pare e pergunte.
- **Nenhuma tabela nova.** Só colunas em `books` (AD-4).
- **O percentual é a fonte da verdade (AD-3).** Nenhuma coluna guarda a página; ela é calculada a partir de `num_pages` e serve só como entrada.
- **Trocar status pelo seletor nunca grava data (AD-1).** Só o botão "Terminei hoje" grava `date_finished`.
- **Nenhuma rota apaga progresso do dono.** Marcar "lido" preserva o valor gravado; a exibição é que o omite.
- **Todo acesso a dados do usuário passa por `withUser`** (RLS). Nenhum `!` non-null assertion (ESLint `error`, gate bloqueante).
- **PT/inglês:** interface e mensagens de erro em português; código em inglês.
- **`git` neste repo:** exportar antes de qualquer git — `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'`. Nunca `git config --global`.
- **Segredos:** nunca imprimir `.env`/`.env.test`. Testes de banco usam `createTestDb`.
- **Migrations são escritas à mão** (ver `0007`–`0012`), e cada uma exige entrada nova em `lib/db/migrations/meta/_journal.json`. Não rode `drizzle-kit generate`.
- **Gates:** `pnpm typecheck` + `pnpm lint` + `pnpm test:run` verdes ao fim de cada task.

---

## File Structure

**Criados**

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/migrations/0013_reading_progress.sql` | Colunas novas e as duas travas |
| `lib/reading.ts` | Conversões puras: página ↔ percentual, dias parado. Sem banco, sem React |
| `app/(main)/[id]/progress-controls.tsx` | Progresso e motivo de abandono na página do livro |
| `components/reading-strip.tsx` | Faixa dos livros em leitura, no topo do catálogo |
| `test/reading.test.ts` | Conversões e limites |
| `test/db/reading-progress.test.ts` | Migration, travas e consultas |
| `test/api/reading-patch.test.ts` | Transições de status da rota |

**Modificados**

| Arquivo | Mudança |
|---|---|
| `lib/db/schema.ts` | Colunas novas; `READ_STATUS` ganha `ABANDONADO` |
| `lib/db/migrations/meta/_journal.json` | Entrada da 0013 |
| `app/api/books/[id]/route.ts` | Aceita `progressPercent`/`dnfReason`; transições do AD-6 |
| `app/api/reading/stats/route.ts` | Abandonados, mês, ano, lidos sem data |
| `lib/db/queries.ts` | `fetchReadingNow`; `Book` ganha os campos de progresso |
| `components/dashboard.tsx` | Cards e blocos novos |
| `components/cover-badges.tsx` | Selo de abandonado |
| `components/filters.tsx` | Opção "Abandonado" no filtro de status |
| `app/(main)/[id]/page.tsx` | Renderiza `ProgressControls` |
| `app/(main)/page.tsx` | Renderiza `ReadingStrip` |

---

### Task 1: Colunas, travas e o quarto status

**Files:**
- Create: `lib/db/migrations/0013_reading_progress.sql`, `test/db/reading-progress.test.ts`
- Modify: `lib/db/schema.ts`, `lib/db/migrations/meta/_journal.json`

**Interfaces:**
- Consumes: tabela `books`
- Produces:
```ts
// lib/db/schema.ts
export const READ_STATUS = {
  LIDO: 'lido', LENDO: 'lendo', NAO_LIDO: 'não lido', ABANDONADO: 'abandonado',
} as const;
// books ganha: progress_percent (integer), progress_updated_at (timestamptz), dnf_reason (text)
```

- [ ] **Step 1: Escrever o teste que falha**

`test/db/reading-progress.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const [u] = await ctx.sql`insert into app_users (email) values ('rp@x.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

async function inserir(campos: Record<string, unknown> = {}) {
  const status = campos.read_status ?? 'não lido';
  const progresso = campos.progress_percent ?? null;
  return ctx.sql`
    insert into books (user_id, title, title_source, read_status, progress_percent)
    values (${userId}, 'L', 'L', ${status as string}, ${progresso as number | null})
    returning id, progress_percent, progress_updated_at, dnf_reason`;
}

describe('colunas de progresso', () => {
  it('nascem nulas e não alteram livros existentes', async () => {
    const [b] = await inserir();
    expect(b.progress_percent).toBeNull();
    expect(b.progress_updated_at).toBeNull();
    expect(b.dnf_reason).toBeNull();
  });

  it('aceita 0 e 100', async () => {
    const [zero] = await inserir({ progress_percent: 0 });
    expect(zero.progress_percent).toBe(0);
    const [cem] = await inserir({ progress_percent: 100 });
    expect(cem.progress_percent).toBe(100);
  });

  it('recusa progresso negativo', async () => {
    await expect(inserir({ progress_percent: -1 })).rejects.toThrow(/check/i);
  });

  it('recusa progresso acima de 100', async () => {
    await expect(inserir({ progress_percent: 101 })).rejects.toThrow(/check/i);
  });

  it('guarda o motivo do abandono', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, read_status, dnf_reason)
      values (${userId}, 'A', 'A', 'abandonado', 'ritmo arrastado')
      returning dnf_reason`;
    expect(b.dnf_reason).toBe('ritmo arrastado');
  });
});

describe('trava de read_status (AD-9)', () => {
  it('aceita os quatro valores válidos', async () => {
    for (const status of ['lido', 'lendo', 'não lido', 'abandonado']) {
      const [b] = await inserir({ read_status: status });
      expect(b).toBeDefined();
    }
  });

  it('recusa um status inventado', async () => {
    await expect(inserir({ read_status: 'quase lido' })).rejects.toThrow(/check/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/reading-progress.test.ts`
Expected: FAIL — `column "progress_percent" of relation "books" does not exist`.

- [ ] **Step 3: Escrever a migration**

`lib/db/migrations/0013_reading_progress.sql`:

```sql
ALTER TABLE "books" ADD COLUMN "progress_percent" integer;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "progress_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "dnf_reason" text;--> statement-breakpoint

-- NULL e 0 são coisas diferentes: NULL é "nunca registrei", 0 é "comecei e
-- não avancei". Por isso a trava aceita nulo explicitamente.
ALTER TABLE "books" ADD CONSTRAINT "books_progress_percent_check"
  CHECK ("progress_percent" IS NULL
         OR ("progress_percent" >= 0 AND "progress_percent" <= 100));--> statement-breakpoint

-- Sem esta trava a coluna aceita qualquer texto, e um erro de digitação em
-- qualquer ponto do código cria um status fantasma: invisível nos filtros e
-- silencioso. Os registros atuais só contêm 'lido' e 'não lido' (AD-9).
ALTER TABLE "books" ADD CONSTRAINT "books_read_status_check"
  CHECK ("read_status" IN ('lido', 'lendo', 'não lido', 'abandonado'));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_books_progress_updated"
  ON "books" ("user_id", "progress_updated_at");
```

- [ ] **Step 4: Registrar no journal**

Em `lib/db/migrations/meta/_journal.json`, acrescentar ao fim do array `entries`:

```json
    {
      "idx": 13,
      "version": "7",
      "when": 1786760000000,
      "tag": "0013_reading_progress",
      "breakpoints": true
    }
```

- [ ] **Step 5: Atualizar o schema**

Em `lib/db/schema.ts`, ampliar o objeto de status:

```ts
export const READ_STATUS = {
  LIDO: 'lido',
  LENDO: 'lendo',
  NAO_LIDO: 'não lido',
  ABANDONADO: 'abandonado',
} as const;
```

e acrescentar as colunas dentro de `books`, logo abaixo de `read_status`:

```ts
    progress_percent: integer('progress_percent'),
    progress_updated_at: timestamp('progress_updated_at', { withTimezone: true }),
    dnf_reason: text('dnf_reason'),
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm test:run test/db/reading-progress.test.ts && pnpm typecheck`
Expected: PASS — 7 testes.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/ test/db/reading-progress.test.ts
git commit -m "feat: add reading progress columns and status check"
```

---

### Task 2: Conversões puras

Módulo sem banco e sem React — é o que o torna testável sem infraestrutura.

**Files:**
- Create: `lib/reading.ts`, `test/reading.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
```ts
export const DIAS_PARA_PARADO = 14;

/** Página aproximada correspondente ao percentual. null se faltar base. */
export function paginaDoPercentual(
  percent: number | null, numPages: number | null
): number | null;

/** Percentual inteiro correspondente à página. null se faltar base. */
export function percentualDaPagina(
  pagina: number, numPages: number | null
): number | null;

/** Dias inteiros desde a última atualização. null se nunca atualizado. */
export function diasParado(
  atualizadoEm: Date | string | null, agora?: Date
): number | null;
```

- [ ] **Step 1: Escrever o teste que falha**

`test/reading.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  paginaDoPercentual, percentualDaPagina, diasParado, DIAS_PARA_PARADO,
} from '@/lib/reading';

describe('paginaDoPercentual', () => {
  it('converte usando o total do livro', () => {
    expect(paginaDoPercentual(58, 310)).toBe(180);
  });

  it('0% é a página 0, não a 1', () => {
    expect(paginaDoPercentual(0, 310)).toBe(0);
  });

  it('100% é a última página', () => {
    expect(paginaDoPercentual(100, 310)).toBe(310);
  });

  it('sem percentual devolve null', () => {
    expect(paginaDoPercentual(null, 310)).toBeNull();
  });

  it('sem total de páginas devolve null', () => {
    expect(paginaDoPercentual(58, null)).toBeNull();
  });
});

describe('percentualDaPagina', () => {
  it('converte e arredonda para inteiro', () => {
    expect(percentualDaPagina(180, 310)).toBe(58);
  });

  it('a última página é 100%', () => {
    expect(percentualDaPagina(310, 310)).toBe(100);
  });

  it('página 0 é 0%', () => {
    expect(percentualDaPagina(0, 310)).toBe(0);
  });

  it('página além do total devolve null — a base não bate', () => {
    // Com fonte ampliada o leitor repagina: "página 700 de 800" num livro
    // cujo metadado diz 310. Converter daria 226%, e clampar para 100%
    // gravaria "terminei" para quem está na metade. Melhor recusar e deixar
    // o dono usar o percentual, que é a fonte da verdade (AD-3).
    expect(percentualDaPagina(999, 310)).toBeNull();
  });

  it('sem total de páginas devolve null', () => {
    expect(percentualDaPagina(180, null)).toBeNull();
  });
});

describe('diasParado', () => {
  const agora = new Date('2026-08-14T12:00:00Z');

  it('conta os dias inteiros desde a atualização', () => {
    expect(diasParado('2026-07-21T12:00:00Z', agora)).toBe(24);
  });

  it('mesmo dia é zero', () => {
    expect(diasParado('2026-08-14T08:00:00Z', agora)).toBe(0);
  });

  it('nunca atualizado devolve null', () => {
    expect(diasParado(null, agora)).toBeNull();
  });

  it('o limite de "parado" é de duas semanas', () => {
    expect(DIAS_PARA_PARADO).toBe(14);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/reading.test.ts`
Expected: FAIL — `Cannot find module '@/lib/reading'`.

- [ ] **Step 3: Implementar `lib/reading.ts`**

```ts
// lib/reading.ts
//
// Conversões entre página e percentual. O percentual é a fonte da verdade
// (AD-3): o dono lê com fonte ampliada, e a página do e-reader dele não
// corresponde à do metadado. Estas funções servem à entrada e à exibição,
// nunca ao armazenamento.

export const DIAS_PARA_PARADO = 14;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export function paginaDoPercentual(
  percent: number | null,
  numPages: number | null
): number | null {
  if (percent === null || numPages === null || numPages <= 0) return null;
  return Math.round((percent / 100) * numPages);
}

export function percentualDaPagina(
  pagina: number,
  numPages: number | null
): number | null {
  if (numPages === null || numPages <= 0) return null;
  if (pagina < 0) return null;
  // Página além do total significa que a base não bate — o leitor repaginou
  // por causa da fonte ampliada. Clampar para 100% gravaria "terminei" para
  // quem está na metade; devolver null deixa a interface avisar e o dono
  // usar o percentual, que é a fonte da verdade (AD-3).
  if (pagina > numPages) return null;
  return Math.round((pagina / numPages) * 100);
}

export function diasParado(
  atualizadoEm: Date | string | null,
  agora: Date = new Date()
): number | null {
  if (atualizadoEm === null) return null;
  const quando = atualizadoEm instanceof Date ? atualizadoEm : new Date(atualizadoEm);
  if (Number.isNaN(quando.getTime())) return null;
  return Math.floor((agora.getTime() - quando.getTime()) / MS_POR_DIA);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/reading.test.ts`
Expected: PASS — 14 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/reading.ts test/reading.test.ts
git commit -m "feat: add reading progress conversions"
```

---

### Task 3: Transições de status na rota

**Files:**
- Modify: `app/api/books/[id]/route.ts`
- Test: `test/api/reading-patch.test.ts` (criar)

**Interfaces:**
- Consumes: `withUser`, `getCurrentUserId`, `errorResponse`
- Produces: `PATCH /api/books/[id]` aceita `progressPercent` (0–100 inteiro), `dnfReason` (texto ou null) e `finishedToday` (booleano)

- [ ] **Step 1: Escrever o teste que falha**

`test/api/reading-patch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
let ultimoSet: Record<string, unknown> = {};

vi.mock('@/lib/auth-user', () => ({
  getCurrentUserId: vi.fn(async () => 'u-1'),
  AuthError: class extends Error {},
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: unknown) => run(fn)),
}));

// O handler monta um objeto `set` e o entrega ao update. Capturamos esse
// objeto (ver beforeEach) para afirmar sobre o que seria gravado.
async function PATCH(id: string, body: unknown) {
  const mod = await import('@/app/api/books/[id]/route');
  return mod.PATCH(
    new Request(`http://x/api/books/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ultimoSet = {};
  // Captura o `set` inspecionando a função entregue a withUser: ela recebe
  // um tx falso cujo `update().set()` guarda o objeto.
  run.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      update: () => ({
        set: (valores: Record<string, unknown>) => {
          ultimoSet = valores;
          return { where: () => ({ returning: async () => [{ id: 1 }] }) };
        },
      }),
    };
    return fn(tx);
  });
});

describe('progresso', () => {
  it('salvar 45% marca o livro como lendo e carimba a data (AD-6)', async () => {
    const res = await PATCH('1', { progressPercent: 45 });
    expect(res.status).toBe(200);
    expect(ultimoSet.progress_percent).toBe(45);
    expect(ultimoSet.read_status).toBe('lendo');
    expect(ultimoSet.progress_updated_at).toBeInstanceOf(Date);
  });

  it('salvar 0% não muda o status — não é leitura começada', async () => {
    await PATCH('1', { progressPercent: 0 });
    expect(ultimoSet.progress_percent).toBe(0);
    expect(ultimoSet.read_status).toBeUndefined();
  });

  it('salvar 100% não marca lido sozinho (AD-6)', async () => {
    await PATCH('1', { progressPercent: 100 });
    expect(ultimoSet.read_status).toBeUndefined();
    expect(ultimoSet.date_finished).toBeUndefined();
  });

  it('recusa progresso acima de 100', async () => {
    expect((await PATCH('1', { progressPercent: 101 })).status).toBe(400);
  });

  it('recusa progresso negativo', async () => {
    expect((await PATCH('1', { progressPercent: -1 })).status).toBe(400);
  });

  it('recusa progresso fracionário', async () => {
    expect((await PATCH('1', { progressPercent: 45.5 })).status).toBe(400);
  });
});

describe('terminei hoje', () => {
  it('grava status, 100% e data de conclusão juntos (AD-1)', async () => {
    const res = await PATCH('1', { finishedToday: true });
    expect(res.status).toBe(200);
    expect(ultimoSet.read_status).toBe('lido');
    expect(ultimoSet.progress_percent).toBe(100);
    expect(typeof ultimoSet.date_finished).toBe('string');
  });
});

describe('status pelo seletor', () => {
  it('não grava data nenhuma (AD-1)', async () => {
    await PATCH('1', { readStatus: 'lido' });
    expect(ultimoSet.read_status).toBe('lido');
    expect(ultimoSet.date_finished).toBeUndefined();
    expect(ultimoSet.progress_updated_at).toBeUndefined();
  });

  it('não apaga o progresso já gravado', async () => {
    await PATCH('1', { readStatus: 'lido' });
    expect(ultimoSet.progress_percent).toBeUndefined();
  });

  it('aceita abandonado como status válido (AD-7)', async () => {
    const res = await PATCH('1', { readStatus: 'abandonado' });
    expect(res.status).toBe(200);
    expect(ultimoSet.read_status).toBe('abandonado');
  });

  it('recusa status inventado', async () => {
    expect((await PATCH('1', { readStatus: 'quase lido' })).status).toBe(400);
  });
});

describe('motivo do abandono', () => {
  it('grava o motivo', async () => {
    await PATCH('1', { readStatus: 'abandonado', dnfReason: 'ritmo arrastado' });
    expect(ultimoSet.dnf_reason).toBe('ritmo arrastado');
  });

  it('aceita limpar o motivo', async () => {
    await PATCH('1', { dnfReason: null });
    expect(ultimoSet.dnf_reason).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/api/reading-patch.test.ts`
Expected: FAIL — o handler ignora `progressPercent` e `finishedToday`.

- [ ] **Step 3: Estender a rota**

Em `app/api/books/[id]/route.ts`, trocar a constante de status e acrescentar o tratamento. O arquivo passa a começar assim:

```ts
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';

const STATUS = new Set(['lido', 'lendo', 'não lido', 'abandonado']);

/** Data de hoje em ISO (só o dia) — a coluna date_finished é `date`. */
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
```

e, dentro do `PATCH`, acrescentar depois do bloco de `dateFinished`:

```ts
    if (body.progressPercent !== undefined && body.progressPercent !== null) {
      const p = Number(body.progressPercent);
      if (!Number.isInteger(p) || p < 0 || p > 100) {
        return NextResponse.json(
          { error: 'O progresso deve ser um inteiro entre 0 e 100' },
          { status: 400 });
      }
      set.progress_percent = p;
      set.progress_updated_at = new Date();
      // Progresso entre 1 e 99 significa leitura em andamento (AD-6). 0 não
      // muda nada — é "comecei e não avancei" — e 100 espera o clique
      // consciente de "Terminei hoje".
      if (p >= 1 && p <= 99) set.read_status = 'lendo';
    }

    if (body.dnfReason !== undefined) {
      set.dnf_reason = typeof body.dnfReason === 'string' && body.dnfReason.trim()
        ? body.dnfReason.trim()
        : null;
    }

    // "Terminei hoje": a única ação que grava data de conclusão (AD-1).
    if (body.finishedToday === true) {
      set.read_status = 'lido';
      set.progress_percent = 100;
      set.date_finished = hojeISO();
    }
```

**Atenção à ordem:** o bloco de `finishedToday` vem **depois** do de `progressPercent`, para que o clique de concluir vença qualquer percentual enviado no mesmo pedido.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/api/reading-patch.test.ts && pnpm typecheck`
Expected: PASS — 14 testes.

- [ ] **Step 5: Verificar que o acompanhamento antigo não quebrou**

Run: `pnpm test:run test/api/reading.test.ts`
Expected: PASS — os testes existentes de status, nota e datas continuam verdes.

- [ ] **Step 6: Commit**

```bash
git add "app/api/books/[id]/route.ts" test/api/reading-patch.test.ts
git commit -m "feat: accept reading progress and dnf reason on book patch"
```

---

### Task 4: Consultas do painel e da faixa

**Files:**
- Modify: `app/api/reading/stats/route.ts`, `lib/db/queries.ts`, `lib/db/schema.ts`
- Test: `test/db/reading-progress.test.ts` (acrescentar casos)

**Interfaces:**
- Consumes: colunas da Task 1
- Produces:
```ts
// lib/db/queries.ts
export interface ReadingNowBook {
  id: number; title: string; image_url: string | null; thumbhash: string | null;
  progress_percent: number | null; progress_updated_at: Date | null;
  num_pages: number | null;
}
export async function fetchReadingNow(userId: string): Promise<ReadingNowBook[]>;

// GET /api/reading/stats passa a devolver também:
// { abandonados, lidosSemData, mes: { livros, paginas }, ano: { livros, paginas } }
```

- [ ] **Step 1: Acrescentar os testes que falham**

Em `test/db/reading-progress.test.ts`, acrescentar ao fim:

```ts
import { vi } from 'vitest';

describe('livros em leitura', () => {
  it('devolve só os com status lendo, do mais recente para o mais antigo', async () => {
    const ctx2 = await createTestDb();
    vi.doMock('@/lib/db/drizzle', () => ({ db: ctx2.db, client: ctx2.sql }));
    const [u] = await ctx2.sql`insert into app_users (email) values ('rn@x.com') returning id`;

    await ctx2.sql`
      insert into books (user_id, title, title_source, read_status,
                         progress_percent, progress_updated_at)
      values (${u.id}, 'Antigo', 'Antigo', 'lendo', 20, '2026-07-01T10:00:00Z')`;
    await ctx2.sql`
      insert into books (user_id, title, title_source, read_status,
                         progress_percent, progress_updated_at)
      values (${u.id}, 'Recente', 'Recente', 'lendo', 60, '2026-08-10T10:00:00Z')`;
    await ctx2.sql`
      insert into books (user_id, title, title_source, read_status)
      values (${u.id}, 'Parado no tempo', 'Parado no tempo', 'não lido')`;
    await ctx2.sql`
      insert into books (user_id, title, title_source, read_status, progress_percent)
      values (${u.id}, 'Largado', 'Largado', 'abandonado', 30)`;

    const { fetchReadingNow } = await import('@/lib/db/queries');
    const livros = await fetchReadingNow(u.id);

    expect(livros.map((l) => l.title)).toEqual(['Recente', 'Antigo']);
    await ctx2.cleanup();
  });

  it('limita a 6 livros', async () => {
    const ctx3 = await createTestDb();
    vi.doMock('@/lib/db/drizzle', () => ({ db: ctx3.db, client: ctx3.sql }));
    const [u] = await ctx3.sql`insert into app_users (email) values ('rl@x.com') returning id`;
    for (let i = 0; i < 9; i++) {
      await ctx3.sql`
        insert into books (user_id, title, title_source, read_status, progress_percent)
        values (${u.id}, ${'L' + i}, ${'L' + i}, 'lendo', ${i * 10})`;
    }
    const { fetchReadingNow } = await import('@/lib/db/queries');
    expect(await fetchReadingNow(u.id)).toHaveLength(6);
    await ctx3.cleanup();
  });
});
```

E um arquivo novo para as estatísticas, `test/api/stats-periodo.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

const ANO = new Date().getFullYear();

beforeAll(async () => {
  ctx = await createTestDb();
  vi.doMock('@/lib/db/drizzle', () => ({ db: ctx.db, client: ctx.sql }));
  const [u] = await ctx.sql`insert into app_users (email) values ('sp@x.com') returning id`;
  userId = u.id;
  vi.doMock('@/lib/auth-user', () => ({
    getCurrentUserId: async () => userId,
    AuthError: class extends Error {},
  }));

  const hoje = new Date().toISOString().slice(0, 10);

  // concluído hoje: conta no mês e no ano
  await ctx.sql`
    insert into books (user_id, title, title_source, read_status, num_pages, date_finished)
    values (${userId}, 'Do Mês', 'Do Mês', 'lido', 300, ${hoje})`;
  // concluído em 31/12 do ano anterior: não conta em nenhum dos dois
  await ctx.sql`
    insert into books (user_id, title, title_source, read_status, num_pages, date_finished)
    values (${userId}, 'Réveillon', 'Réveillon', 'lido', 200, ${`${ANO - 1}-12-31`})`;
  // lido sem data: conta em lidos, não no período
  await ctx.sql`
    insert into books (user_id, title, title_source, read_status, num_pages)
    values (${userId}, 'Sem Data', 'Sem Data', 'lido', 500)`;
  // abandonado: não conta em lidos nem em páginas
  await ctx.sql`
    insert into books (user_id, title, title_source, read_status, num_pages, progress_percent)
    values (${userId}, 'Largado', 'Largado', 'abandonado', 400, 30)`;
});
afterAll(() => ctx.cleanup());

async function stats() {
  const mod = await import('@/app/api/reading/stats/route');
  const res = await mod.GET();
  return res.json();
}

describe('estatísticas por período', () => {
  it('conta livros e páginas concluídos no ano corrente', async () => {
    const d = await stats();
    expect(d.ano.livros).toBe(1);
    expect(d.ano.paginas).toBe(300);
  });

  it('livro terminado em 31 de dezembro não vaza para o ano seguinte', async () => {
    const d = await stats();
    expect(d.ano.livros).toBe(1);   // 'Réveillon' ficou de fora
  });

  it('conta livros e páginas do mês corrente', async () => {
    const d = await stats();
    expect(d.mes.livros).toBe(1);
    expect(d.mes.paginas).toBe(300);
  });

  it('informa quantos lidos estão sem data (AD-2)', async () => {
    const d = await stats();
    expect(d.lidosSemData).toBe(1);
  });

  it('abandonados têm contagem própria', async () => {
    const d = await stats();
    expect(d.abandonados).toBe(1);
  });

  it('abandonado não entra em lidos nem nas páginas lidas (AD-8)', async () => {
    const d = await stats();
    expect(d.lidos).toBe(3);          // Do Mês, Réveillon, Sem Data
    expect(d.paginasLidas).toBe(1000); // 300 + 200 + 500, sem os 400 do largado
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/reading-progress.test.ts test/api/stats-periodo.test.ts`
Expected: FAIL — `fetchReadingNow` não existe e a rota não devolve `mes`/`ano`.

- [ ] **Step 3: Implementar `fetchReadingNow`**

Em `lib/db/queries.ts`, acrescentar ao fim:

```ts
// — Leitura em andamento —

export interface ReadingNowBook {
  id: number;
  title: string;
  image_url: string | null;
  thumbhash: string | null;
  progress_percent: number | null;
  progress_updated_at: Date | null;
  num_pages: number | null;
}

export const LIVROS_NA_FAIXA = 6;

/**
 * Livros em leitura, do mais recentemente atualizado ao mais antigo.
 * Limitado (AD-5): acima disso a faixa empurraria o catálogo — que é o
 * motivo da página existir — para fora da tela.
 */
export async function fetchReadingNow(
    userId: string
): Promise<ReadingNowBook[]> {
    return withUser(userId, (tx) =>
        tx
            .select({
                id: books.id,
                title: books.title,
                image_url: books.image_url,
                thumbhash: books.thumbhash,
                progress_percent: books.progress_percent,
                progress_updated_at: books.progress_updated_at,
                num_pages: books.num_pages,
            })
            .from(books)
            .where(eq(books.read_status, 'lendo'))
            // nulls last: livro marcado como lendo sem progresso registrado
            // vai para o fim, não para o topo.
            .orderBy(sql`${books.progress_updated_at} desc nulls last`)
            .limit(LIVROS_NA_FAIXA)
    );
}
```

- [ ] **Step 4: Ampliar as estatísticas**

`app/api/reading/stats/route.ts` passa a ser:

```ts
import { getCurrentUserId } from '@/lib/auth-user';
import { withUser } from '@/lib/db/with-user';
import { books } from '@/lib/db/schema';
import { errorResponse } from '@/lib/errors';
import { sql, eq, and, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';

// AD-7 da spec anterior: estatísticas de leitura ignoram posse (`owned`) —
// apagar um livro do Calibre não pode apagar o histórico de que ele foi
// lido. Só o "acervo" (totalBooks/naoLidos) é restrito a livros possuídos.
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const data = await withUser(userId, async (tx) => {
      const one = (where?: ReturnType<typeof eq>) =>
        tx.select({ n: sql<number>`count(*)` }).from(books)
          .where(where).then((r) => Number(r[0].n));

      const totalBooks = await one(eq(books.owned, true));
      const lendo = await one(eq(books.read_status, 'lendo'));
      const lidos = await one(eq(books.read_status, 'lido'));
      const abandonados = await one(eq(books.read_status, 'abandonado'));
      const naoLidos = await one(
        and(eq(books.owned, true), eq(books.read_status, 'não lido'))
      );
      // AD-2: livro lido sem data é estado válido. O painel diz quantos são,
      // senão "Lidos: 4" ao lado de um gráfico vazio parece defeito.
      const lidosSemData = await one(
        and(eq(books.read_status, 'lido'), isNull(books.date_finished))
      );

      const paginasLidas = await tx
        .select({ t: sql<number>`coalesce(sum(${books.num_pages}),0)` })
        .from(books).where(eq(books.read_status, 'lido'))
        .then((r) => Number(r[0].t));

      // Um período é definido pela data de conclusão. `date_trunc` compara
      // no fuso do banco; livro terminado em 31/12 fica no ano dele.
      const periodo = async (unidade: 'month' | 'year') => {
        const [row] = await tx
          .select({
            livros: sql<number>`count(*)`,
            paginas: sql<number>`coalesce(sum(${books.num_pages}),0)`,
          })
          .from(books)
          .where(and(
            eq(books.read_status, 'lido'),
            sql`date_trunc(${unidade}, ${books.date_finished})
                = date_trunc(${unidade}, current_date)`
          ));
        return { livros: Number(row.livros), paginas: Number(row.paginas) };
      };

      const mes = await periodo('month');
      const ano = await periodo('year');

      const porAnoRows = await tx
        .select({
          ano: sql<string>`extract(year from ${books.date_finished})::text`,
          n: sql<number>`count(*)`,
        })
        .from(books)
        .where(sql`${books.date_finished} is not null`)
        .groupBy(sql`extract(year from ${books.date_finished})`);
      const porAno = Object.fromEntries(
        porAnoRows.map((r) => [r.ano, Number(r.n)])
      );

      return {
        totalBooks, lendo, lidos, abandonados, naoLidos,
        lidosSemData, paginasLidas, mes, ano, porAno,
      };
    });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err, 'Erro ao calcular estatísticas');
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test:run test/db/reading-progress.test.ts test/api/stats-periodo.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries.ts app/api/reading/stats/ test/
git commit -m "feat: add period stats and reading-now query"
```

---

### Task 5: Progresso e abandono na página do livro

**Files:**
- Create: `app/(main)/[id]/progress-controls.tsx`
- Modify: `app/(main)/[id]/page.tsx`, `app/(main)/[id]/tracking-controls.tsx`, `lib/db/queries.ts`

**Interfaces:**
- Consumes: `paginaDoPercentual`, `percentualDaPagina`, `diasParado`, `DIAS_PARA_PARADO` (Task 2); `PATCH /api/books/[id]` (Task 3)
- Produces:
```tsx
export function ProgressControls({
  bookId, numPages, initial,
}: {
  bookId: number;
  numPages: number | null;
  initial: {
    readStatus: string;
    progressPercent: number | null;
    progressUpdatedAt: string | null;
    dnfReason: string | null;
  };
}): React.ReactElement;
```

- [ ] **Step 1: Trazer os campos novos na consulta do livro**

Em `lib/db/queries.ts`, no `select` de `fetchBookById`, acrescentar:

```ts
                progress_percent: books.progress_percent,
                progress_updated_at: books.progress_updated_at,
                dnf_reason: books.dnf_reason,
```

- [ ] **Step 2: Acrescentar "Abandonado" ao seletor de status**

Em `app/(main)/[id]/tracking-controls.tsx`, ampliar a lista:

```ts
const READ_STATUS_OPTIONS = [
  { value: 'lido', label: '✅ Lido' },
  { value: 'lendo', label: '📖 Lendo' },
  { value: 'não lido', label: '🕐 Não lido' },
  { value: 'abandonado', label: '🚫 Abandonado' },
];
```

- [ ] **Step 3: Criar `app/(main)/[id]/progress-controls.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  paginaDoPercentual, percentualDaPagina, diasParado, DIAS_PARA_PARADO,
} from '@/lib/reading';

interface ProgressInitial {
  readStatus: string;
  progressPercent: number | null;
  progressUpdatedAt: string | null;
  dnfReason: string | null;
}

export function ProgressControls({
  bookId,
  numPages,
  initial,
}: {
  bookId: number;
  numPages: number | null;
  initial: ProgressInitial;
}) {
  const router = useRouter();
  const [percentual, setPercentual] = useState(
    initial.progressPercent === null ? '' : String(initial.progressPercent)
  );
  const [pagina, setPagina] = useState('');
  const [motivo, setMotivo] = useState(initial.dnfReason ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O progresso só faz sentido enquanto o livro está em andamento ou foi
  // largado: para "lido" e "não lido" o número seria ruído (spec, Modelo).
  const mostrarProgresso =
    initial.readStatus === 'lendo' || initial.readStatus === 'abandonado';

  const atual = initial.progressPercent;
  const paginaAtual = paginaDoPercentual(atual, numPages);
  const dias = diasParado(initial.progressUpdatedAt);
  const parado =
    initial.readStatus === 'lendo' && dias !== null && dias >= DIAS_PARA_PARADO;

  async function enviar(body: Record<string, unknown>) {
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Não limpamos os campos: perder o número digitado por causa de rede
        // instável no celular faz o dono digitar de novo — e desistir.
        setErro(data?.error ?? 'Não foi possível salvar.');
        return;
      }
      router.refresh();
    } catch {
      setErro('Falha de rede ao salvar. O valor digitado continua aqui.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarPercentual() {
    const n = Number(percentual);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      setErro('O progresso deve estar entre 0 e 100.');
      return;
    }
    await enviar({ progressPercent: n });
  }

  async function salvarPagina() {
    const p = Number(pagina);
    if (!Number.isInteger(p) || p < 0) {
      setErro('Informe uma página válida.');
      return;
    }
    const convertido = percentualDaPagina(p, numPages);
    if (convertido === null) {
      setErro(
        numPages === null
          ? 'Este livro não tem número de páginas registrado. Use o percentual.'
          : `Este livro tem ${numPages} páginas. Se o seu leitor mostra mais `
            + '(fonte ampliada repagina o livro), use o percentual.'
      );
      return;
    }
    setPercentual(String(convertido));
    setPagina('');
    await enviar({ progressPercent: convertido });
  }

  return (
    <div className="mb-6 space-y-3 rounded-md border p-4">
      <h2 className="text-lg font-semibold">Progresso</h2>

      {mostrarProgresso && atual !== null && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: `${atual}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {atual}%
            {paginaAtual !== null && ` · página ~${paginaAtual} de ${numPages}`}
            {parado && (
              <span className="ml-2 text-amber-600">Parado há {dias} dias</span>
            )}
          </p>
        </div>
      )}

      {atual === 100 && initial.readStatus !== 'lido' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 p-2 dark:bg-emerald-900/20">
          <span className="text-sm">Chegou ao fim deste livro?</span>
          <Button
            type="button"
            size="sm"
            onClick={() => void enviar({ finishedToday: true })}
            disabled={salvando}
          >
            Terminei hoje
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="block mb-1" htmlFor="progresso-percentual">
            Percentual
          </Label>
          <div className="flex gap-2">
            <Input
              id="progresso-percentual"
              type="number"
              min={0}
              max={100}
              value={percentual}
              onChange={(e) => setPercentual(e.target.value)}
              placeholder="0 a 100"
            />
            <Button
              type="button"
              onClick={() => void salvarPercentual()}
              disabled={salvando}
            >
              Salvar
            </Button>
          </div>
        </div>

        {numPages !== null && (
          <div>
            <Label className="block mb-1" htmlFor="progresso-pagina">
              Ou a página (de {numPages})
            </Label>
            <div className="flex gap-2">
              <Input
                id="progresso-pagina"
                type="number"
                min={0}
                value={pagina}
                onChange={(e) => setPagina(e.target.value)}
                placeholder="Ex.: 180"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void salvarPagina()}
                disabled={salvando}
              >
                Converter
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Só quando o aviso de 100% não está na tela — dois botões iguais na
          mesma tela fazem o dono parar para descobrir se fazem a mesma coisa. */}
      {initial.readStatus !== 'lido' && atual !== 100 && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void enviar({ finishedToday: true })}
            disabled={salvando}
          >
            Terminei hoje
          </Button>
        </div>
      )}

      {initial.readStatus === 'abandonado' && (
        <div>
          <Label className="block mb-1" htmlFor="motivo-abandono">
            Por que abandonou?
          </Label>
          <textarea
            id="motivo-abandono"
            className="flex w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Pode ser o motivo para voltar a ele um dia..."
          />
          <Button
            type="button"
            size="sm"
            className="mt-2"
            onClick={() => void enviar({ dnfReason: motivo })}
            disabled={salvando}
          >
            Salvar motivo
          </Button>
        </div>
      )}

      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Renderizar na página do livro**

Em `app/(main)/[id]/page.tsx`, importar:

```tsx
import { ProgressControls } from './progress-controls';
```

e renderizar logo depois do `<TrackingControls .../>`:

```tsx
          <ProgressControls
            bookId={book.id}
            numPages={book.num_pages}
            initial={{
              readStatus: book.read_status,
              progressPercent: book.progress_percent,
              progressUpdatedAt: book.progress_updated_at
                ? book.progress_updated_at.toISOString()
                : null,
              dnfReason: book.dnf_reason,
            }}
          />
```

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add "app/(main)/[id]/" lib/db/queries.ts
git commit -m "feat: track reading progress and abandonment on the book page"
```

---

### Task 6: Faixa no topo do catálogo e selo de abandonado

**Files:**
- Create: `components/reading-strip.tsx`
- Modify: `app/(main)/page.tsx`, `components/cover-badges.tsx`, `components/filters.tsx`

**Interfaces:**
- Consumes: `fetchReadingNow` (Task 4), `diasParado`/`DIAS_PARA_PARADO` (Task 2)
- Produces:
```tsx
export function ReadingStrip({ livros }: { livros: ReadingNowBook[] }): React.ReactElement | null;
```

- [ ] **Step 1: Criar a faixa**

`components/reading-strip.tsx`:

```tsx
import Link from 'next/link';
import { Photo } from './photo';
import { diasParado, DIAS_PARA_PARADO } from '@/lib/reading';
import type { ReadingNowBook } from '@/lib/db/queries';

export function ReadingStrip({ livros }: { livros: ReadingNowBook[] }) {
  // Faixa vazia não é renderizada (AD-5): um espaço fixo dizendo "nenhum
  // livro em leitura" é ruído permanente para o que a ausência já diz.
  if (livros.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
        Lendo agora
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {livros.map((livro) => {
          const dias = diasParado(livro.progress_updated_at);
          const parado = dias !== null && dias >= DIAS_PARA_PARADO;
          const percentual = livro.progress_percent ?? 0;

          return (
            <Link
              key={livro.id}
              href={`/${livro.id}`}
              className="w-24 shrink-0 transition ease-in-out md:hover:scale-105"
            >
              <Photo
                src={livro.image_url}
                title={livro.title}
                thumbhash={livro.thumbhash}
                priority={false}
                readStatus="lendo"
                myRating={null}
              />
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${percentual}%` }}
                />
              </div>
              <p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-400">
                {percentual}%
              </p>
              {parado && (
                <p className="text-[10px] text-amber-600">Parado há {dias}d</p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Renderizar no catálogo**

Em `app/(main)/page.tsx`, importar:

```tsx
import { fetchReadingNow } from '@/lib/db/queries';
import { ReadingStrip } from '@/components/reading-strip';
```

incluir na busca paralela:

```tsx
  const [books, estimatedTotal, bibliotecas, lendoAgora] = await Promise.all([
    fetchBooksWithPagination(userId, parsedSearchParams),
    estimateTotalBooks(userId, parsedSearchParams),
    fetchCollections(userId),
    fetchReadingNow(userId),
  ]);
```

e renderizar dentro do bloco rolável, antes da grade:

```tsx
        <div className="group-has-[[data-pending]]:animate-pulse p-4">
          <ReadingStrip livros={lendoAgora} />
          <BooksGrid
            books={books}
            searchParams={parsedSearchParams}
            bibliotecas={bibliotecas}
          />
        </div>
```

- [ ] **Step 3: Selo de abandonado sobre a capa**

Em `components/cover-badges.tsx`, acrescentar a entrada no mapa de rótulos:

```ts
const STATUS_LABEL: Record<string, { texto: string; classe: string }> = {
  lido: { texto: 'Lido', classe: 'bg-emerald-600' },
  lendo: { texto: 'Lendo', classe: 'bg-amber-500' },
  abandonado: { texto: 'Abandonado', classe: 'bg-gray-600' },
};
```

- [ ] **Step 4: Opção no filtro de status**

Em `components/filters.tsx`:

```ts
const READ_STATUS_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'lido', label: '✅ Lido' },
  { value: 'lendo', label: '📖 Lendo' },
  { value: 'não lido', label: '🕐 Não lido' },
  { value: 'abandonado', label: '🚫 Abandonado' },
];
```

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add components/ "app/(main)/page.tsx"
git commit -m "feat: add reading strip and abandoned status to the catalog"
```

---

### Task 7: Painel com abandonados, mês e ano

**Files:**
- Modify: `components/dashboard.tsx`

**Interfaces:**
- Consumes: `GET /api/reading/stats` ampliado (Task 4)
- Produces: nada para outras tasks

- [ ] **Step 1: Atualizar o tipo e os cards**

Em `components/dashboard.tsx`, ampliar a interface:

```ts
interface Periodo {
  livros: number;
  paginas: number;
}

interface Stats {
  totalBooks: number;
  lendo: number;
  lidos: number;
  abandonados: number;
  naoLidos: number;
  lidosSemData: number;
  paginasLidas: number;
  mes: Periodo;
  ano: Periodo;
  porAno: Record<string, number>;
}
```

acrescentar o ícone ao import existente de `lucide-react`:

```ts
import {
  BookOpenIcon,
  BookmarkIcon,
  LibraryIcon,
  BookXIcon,
} from 'lucide-react';
```

e incluir o card entre "Lidos" e "Páginas":

```ts
    {
      label: 'Abandonados',
      value: stats.abandonados,
      icon: BookXIcon,
      color: 'text-gray-600 bg-gray-200 dark:text-gray-300 dark:bg-gray-700',
    },
```

- [ ] **Step 2: Acrescentar os blocos de período**

Ainda em `components/dashboard.tsx`, entre a grade de cards e o bloco "Lidos por ano":

```tsx
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            Neste mês
          </h3>
          <p className="text-sm">
            <span className="text-xl font-bold">{stats.mes.livros}</span>{' '}
            {stats.mes.livros === 1 ? 'livro' : 'livros'} ·{' '}
            {stats.mes.paginas.toLocaleString('pt-BR')} páginas
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            Neste ano
          </h3>
          <p className="text-sm">
            <span className="text-xl font-bold">{stats.ano.livros}</span>{' '}
            {stats.ano.livros === 1 ? 'livro' : 'livros'} ·{' '}
            {stats.ano.paginas.toLocaleString('pt-BR')} páginas
          </p>
        </div>
      </div>
```

- [ ] **Step 3: A linha dos lidos sem data**

Logo abaixo do bloco "Lidos por ano" (dentro do mesmo `div` externo):

```tsx
      {stats.lidosSemData > 0 && (
        // AD-2: sem esta linha, "Lidos: 4" ao lado de um gráfico por ano
        // vazio parece defeito, quando é a consequência de não inventarmos
        // datas para leituras antigas.
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {stats.lidosSemData}{' '}
          {stats.lidosSemData === 1 ? 'lido sem data registrada' : 'lidos sem data registrada'}
          {' '}— não entram na contagem por período.
        </p>
      )}
```

- [ ] **Step 4: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard.tsx
git commit -m "feat: show abandoned count and period stats on the dashboard"
```

---

## Notas de execução

**Ordem obrigatória:** 1 → 2 → 3 → 4 (colunas, conversões, rota, consultas) antes de 5, 6 e 7, que consomem as quatro. Entre 5, 6 e 7 não há dependência.

**Etapa manual, depois do código:** `pnpm db:migrate` para aplicar a `0013`. **Rode antes de mergear** — a Task 4 muda `/api/reading/stats`, que o painel chama em toda visita ao catálogo; sem as colunas, a consulta falha.

**A Task 1 carrega a trava de integridade.** O teste que recusa `'quase lido'` é o que prova o AD-9. Se ele não passar, a coluna continua aceitando qualquer texto.

**O que observar no uso real:** o AD-6 (salvar progresso muda o status sozinho) é o comportamento com maior chance de surpreender. Se incomodar, o seletor de status continua mandando — e a decisão pode ser revista sem desfazer nada do resto.

**Fora de escopo, registrado:** página inicial própria de leitura; histórico de progresso (páginas por dia, ritmo, sequências); metas de leitura; data de abandono própria; reordenar a faixa; corrigir a contagem estimada do rodapé do catálogo (`estimateTotalBooks` usa `EXPLAIN` e erra — defeito conhecido e independente).

**Pendência herdada:** a RLS só terá efeito em produção quando a aplicação conectar como `book_app` em vez de `postgres`.
