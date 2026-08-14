# Ajustes de leitura, Próximos e Favoritos — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o abandono de livro grudar em qualquer ordem de operações, aceitar meia estrela na avaliação, e dar às duas pontas da estante — o que vem depois (Próximos) e o que valeu mais (Favoritos) — páginas próprias, além de um salto direto para uma página do catálogo.

**Architecture:** Três colunas em `books` (`my_rating` vira `real`, mais `next_up` e `favorite` booleanas) e uma mudança estrutural na rota `PATCH /api/books/[id]`: ela passa a ler o estado atual do livro dentro da mesma transação da escrita, em vez de decidir com base no que o cliente enviou. Todas as regras de status (promover a "lendo", limpar `next_up`, exigir posse ou leitura) passam a ser decididas nesse ponto único.

**Tech Stack:** Next.js 15 (App Router, Server Components), React 19, Drizzle ORM 0.33 sobre Postgres (Supabase, com RLS), Tailwind + shadcn/ui, Vitest.

## Global Constraints

- **Idioma:** todo texto de interface, mensagem de erro, comentário e nome de identificador novo em **português**, seguindo o código existente (`salvando`, `erro`, `livros`).
- **Migrations são escritas à mão**, não geradas: crie o `.sql` e adicione a entrada correspondente em `lib/db/migrations/meta/_journal.json`. Não gere snapshot — as migrations 0011 em diante não têm (`ls lib/db/migrations/meta/` confirma).
- **A próxima migration é a `0015`.** As últimas são `0012_collections`, `0013_reading_progress`, `0014_cover_hash`.
- **Toda consulta ao banco passa por `withUser(userId, tx => ...)`**, nunca por `db` direto. É o que ativa a RLS por usuário. Uma rota que use `db` direto vaza dados entre usuários.
- **`lib/db/calibre-sync.ts` não pode ganhar campos novos.** O tipo `CatalogMetadata` é a proteção estrutural que impede o sync de sobrescrever dados de leitura. `next_up` e `favorite` ficam fora dele.
- **Status válidos:** `'lido'`, `'lendo'`, `'não lido'`, `'abandonado'` — com acento em "não lido".
- **Nota:** múltiplos de 0,5 entre 0,5 e 5,0, ou `null`.
- **Testes:** `pnpm test:run <caminho>` para um arquivo. Os testes em `test/db/` precisam de banco (`requireTestDatabaseUrl`); os de `test/api/` são unitários com mocks.
- **Commits em português**, no padrão do repositório (`feat:`, `fix:`, `docs:`).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `lib/db/migrations/0015_next_up_favorite.sql` | Tipo de `my_rating`, colunas novas, constraint e índices parciais | Criar |
| `lib/db/migrations/meta/_journal.json` | Registro da migration | Modificar |
| `lib/db/schema.ts` | Colunas e tipos | Modificar |
| `app/api/books/[id]/route.ts` | Todas as regras de status e marcação, decididas na transação | Modificar |
| `lib/db/queries.ts` | `fetchNextUp` e `fetchFavorites` | Modificar |
| `components/estrelas.tsx` | Entrada e exibição de nota com meio passo, reutilizável | Criar |
| `app/(main)/[id]/tracking-controls.tsx` | Status, nota, motivo do abandono, marcações | Modificar |
| `app/(main)/[id]/progress-controls.tsx` | Só progresso — perde o motivo do abandono | Modificar |
| `components/cover-badges.tsx` | Selos da capa, incluindo meia estrela e as duas marcas | Modificar |
| `components/book-pagination.tsx` | Salto de página | Modificar |
| `app/(main)/proximos/page.tsx` | Página da fila | Criar |
| `app/(main)/favoritos/page.tsx` | Página dos favoritos | Criar |
| `components/estante.tsx` | Grade de capas compartilhada pelas duas páginas novas | Criar |
| `components/nav-bar.tsx` | Dois itens de menu | Modificar |
| `components/grid.tsx` | Multi-seleção também marca Próximos | Modificar |

`components/estrelas.tsx` e `components/estante.tsx` existem para não duplicar: a barra de estrelas é usada na página do livro e na capa, e a grade de capas seria idêntica nas duas páginas novas.

---

### Task 1: Migração e schema

**Files:**
- Create: `lib/db/migrations/0015_next_up_favorite.sql`
- Modify: `lib/db/migrations/meta/_journal.json`
- Modify: `lib/db/schema.ts:75` (`my_rating`), `lib/db/schema.ts:78-82` (colunas novas)
- Test: `test/db/proximos-favoritos-schema.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: colunas `books.my_rating` (`real`), `books.next_up` (`boolean not null default false`), `books.favorite` (`boolean not null default false`). Em `schema.ts`, os campos Drizzle `books.my_rating`, `books.next_up`, `books.favorite`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `test/db/proximos-favoritos-schema.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const [u] = await ctx.sql`
    insert into app_users (email) values ('proximos@teste.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

describe('nota com meia estrela', () => {
  it('aceita 3.5', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'Meia', 'Meia', 3.5) returning my_rating`;
    expect(Number(b.my_rating)).toBe(3.5);
  });

  it('aceita 5 e aceita nulo', async () => {
    const [cheia] = await ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'Cheia', 'Cheia', 5) returning my_rating`;
    expect(Number(cheia.my_rating)).toBe(5);
    const [sem] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${userId}, 'Sem', 'Sem') returning my_rating`;
    expect(sem.my_rating).toBeNull();
  });

  it('recusa um quarto de estrela', async () => {
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'Quarto', 'Quarto', 3.25)`).rejects.toThrow(/check/i);
  });

  it('recusa nota acima de 5 e abaixo de meia', async () => {
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'Alta', 'Alta', 5.5)`).rejects.toThrow(/check/i);
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'Zero', 'Zero', 0)`).rejects.toThrow(/check/i);
  });
});

describe('marcações de próximo e favorito', () => {
  it('nascem falsas', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${userId}, 'Padrão', 'Padrão') returning next_up, favorite`;
    expect(b.next_up).toBe(false);
    expect(b.favorite).toBe(false);
  });

  it('guardam verdadeiro', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, next_up, favorite)
      values (${userId}, 'Marcado', 'Marcado', true, true)
      returning next_up, favorite`;
    expect(b.next_up).toBe(true);
    expect(b.favorite).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm test:run test/db/proximos-favoritos-schema.test.ts`
Expected: FAIL — `column "next_up" of relation "books" does not exist`, e o caso de 3.5 falhando pelo check antigo (`my_rating BETWEEN 1 AND 5` sobre `integer` arredonda ou rejeita).

- [ ] **Step 3: Escrever a migration**

Crie `lib/db/migrations/0015_next_up_favorite.sql`:

```sql
-- A constraint antiga (0009) trava a nota em inteiros de 1 a 5. Precisa cair
-- antes da troca de tipo: um CHECK sobre a coluna impede o ALTER TYPE.
ALTER TABLE "books" DROP CONSTRAINT IF EXISTS "books_my_rating_range";--> statement-breakpoint

-- `real` em vez de inteiro em meios (1..10): o número gravado passa a ser o
-- número exibido, sem nenhum leitor precisar dividir por 2. Múltiplos de 0,5
-- são exatos em binário, então não há erro de arredondamento.
-- Os valores 1..5 já gravados continuam válidos — não há reescrita de dados.
ALTER TABLE "books" ALTER COLUMN "my_rating" TYPE real;--> statement-breakpoint

ALTER TABLE "books" ADD CONSTRAINT "books_my_rating_range"
  CHECK ("my_rating" IS NULL
         OR ("my_rating" >= 0.5 AND "my_rating" <= 5
             AND ("my_rating" * 2) = floor("my_rating" * 2)));--> statement-breakpoint

ALTER TABLE "books" ADD COLUMN "next_up" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "favorite" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Índices parciais: as duas listas são pequenas por natureza (dezenas de
-- linhas num acervo de mais de mil). Indexar a coluna inteira gastaria
-- espaço para encontrar o que cabe numa tela.
CREATE INDEX IF NOT EXISTS "idx_books_user_next_up"
  ON "books" ("user_id") WHERE "next_up";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_user_favorite"
  ON "books" ("user_id") WHERE "favorite";
```

- [ ] **Step 4: Registrar a migration no journal**

Em `lib/db/migrations/meta/_journal.json`, adicione ao fim do array `entries` (depois da entrada `0014_cover_hash`), respeitando a vírgula do item anterior:

```json
    {
      "idx": 15,
      "version": "7",
      "when": 1786780000000,
      "tag": "0015_next_up_favorite",
      "breakpoints": true
    }
```

- [ ] **Step 5: Atualizar o schema Drizzle**

Em `lib/db/schema.ts`, troque a linha `my_rating: integer('my_rating'),` por:

```ts
    // real, não integer: meia estrela. Ver AD-1 da spec de 2026-08-14.
    my_rating: real('my_rating'),
```

E logo abaixo de `owned: boolean('owned').notNull().default(true),`, acrescente:

```ts
    // Fila de leitura e lista curta de favoritos. São dados de leitura, não
    // de catálogo: ficam fora de CatalogMetadata e sobrevivem ao sync.
    next_up: boolean('next_up').notNull().default(false),
    favorite: boolean('favorite').notNull().default(false),
```

`real` e `boolean` já estão importados no topo do arquivo — confira a linha 3 antes de mexer no import.

Os índices parciais ficam só no SQL: o `.where()` de índice do drizzle-kit 0.24 não é usado em nenhum outro ponto deste schema, e as migrations aqui são escritas à mão de qualquer forma.

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `pnpm test:run test/db/proximos-favoritos-schema.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 7: Rodar a suíte de schema que já existia, para garantir que nada quebrou**

Run: `pnpm test:run test/db/tracking-schema.test.ts test/db/schema.test.ts`
Expected: PASS. Atenção ao caso `aceita my_rating entre 1 e 5 e recusa fora do intervalo` em `tracking-schema.test.ts:14` — ele insere 4 e espera que 9 falhe; ambos continuam válidos com a constraint nova.

- [ ] **Step 8: Verificar os tipos**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add lib/db/migrations/0015_next_up_favorite.sql lib/db/migrations/meta/_journal.json lib/db/schema.ts test/db/proximos-favoritos-schema.test.ts
git commit -m "feat: nota com meia estrela e colunas de proximo e favorito"
```

---

### Task 2: A rota lê o estado atual na transação

Esta é a mudança estrutural que corrige o defeito do abandono. Ela vem antes de qualquer regra nova porque todas dependem dela.

**Files:**
- Modify: `app/api/books/[id]/route.ts:15-84` (a função `PATCH` inteira)
- Test: `test/api/reading-patch.test.ts` (o mock de transação ganha `select`; casos novos)

**Interfaces:**
- Consumes: `books.next_up`, `books.favorite`, `books.my_rating` da Task 1.
- Produces: `PATCH` passa a aceitar no corpo `nextUp?: boolean` e `favorite?: boolean` (implementados na Task 4) e a decidir status a partir do estado lido no banco. Códigos de resposta: 200 sucesso, 400 corpo inválido, 404 livro inexistente, 409 regra de negócio violada.

- [ ] **Step 1: Ampliar o mock de transação nos testes existentes**

O mock atual (`test/api/reading-patch.test.ts:31-41`) só oferece `update`. A rota passará a chamar `select` antes. Substitua o bloco `beforeEach` inteiro por:

```ts
// Estado que o banco devolveria para o livro alvo. Cada teste ajusta antes
// de chamar a rota — é o que torna possível afirmar sobre regras que
// dependem do status atual em vez do que o cliente mandou.
let livroAtual: Record<string, unknown> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  ultimoSet = {};
  livroAtual = { read_status: 'não lido', owned: true, next_up: false, favorite: false };
  run.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => (livroAtual ? [livroAtual] : []),
          }),
        }),
      }),
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
```

Declare `let livroAtual` junto de `ultimoSet` no topo do arquivo (linha 4), não dentro do `beforeEach`.

- [ ] **Step 2: Escrever os testes que falham**

Acrescente ao fim de `test/api/reading-patch.test.ts`:

```ts
describe('progresso não sobrescreve decisão do dono (AD-3)', () => {
  it('livro abandonado continua abandonado ao receber progresso', async () => {
    livroAtual = { read_status: 'abandonado', owned: true, next_up: false, favorite: false };
    const res = await PATCH('1', { progressPercent: 50 });
    expect(res.status).toBe(200);
    expect(ultimoSet.progress_percent).toBe(50);
    expect(ultimoSet.read_status).toBeUndefined();
  });

  it('livro lido continua lido ao receber progresso', async () => {
    livroAtual = { read_status: 'lido', owned: true, next_up: false, favorite: false };
    await PATCH('1', { progressPercent: 50 });
    expect(ultimoSet.read_status).toBeUndefined();
  });

  it('livro não lido vira lendo ao receber progresso', async () => {
    livroAtual = { read_status: 'não lido', owned: true, next_up: false, favorite: false };
    await PATCH('1', { progressPercent: 50 });
    expect(ultimoSet.read_status).toBe('lendo');
  });

  it('abandonar e gravar progresso no mesmo pedido mantém abandonado', async () => {
    livroAtual = { read_status: 'lendo', owned: true, next_up: false, favorite: false };
    await PATCH('1', { readStatus: 'abandonado', progressPercent: 50 });
    expect(ultimoSet.read_status).toBe('abandonado');
    expect(ultimoSet.progress_percent).toBe(50);
  });

  it('devolve 404 quando o livro não existe', async () => {
    livroAtual = undefined;
    const res = await PATCH('1', { progressPercent: 50 });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test:run test/api/reading-patch.test.ts`
Expected: FAIL — os casos de abandonado e lido gravam `read_status: 'lendo'`, porque a regra atual não olha o estado.

- [ ] **Step 4: Reescrever o PATCH**

Em `app/api/books/[id]/route.ts`, substitua a função `PATCH` inteira (linhas 15 a 84) por:

```ts
/** O que a transação decidiu — distingue erro de regra de erro de corpo. */
type Resultado =
  | { kind: 'ok' }
  | { kind: 'nao-encontrado' }
  | { kind: 'conflito'; mensagem: string };

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

    // ─── Validação do corpo ───────────────────────────────────
    // Só o que dá para julgar sem conhecer o livro. Regras que dependem do
    // estado atual ficam na transação, abaixo.
    if (body.readStatus !== undefined) {
      if (!STATUS.has(body.readStatus))
        return NextResponse.json({ error: 'status inválido' }, { status: 400 });
      set.read_status = body.readStatus;
    }
    if (body.myRating !== undefined && body.myRating !== null) {
      const r = Number(body.myRating);
      // Múltiplos de 0,5 entre 0,5 e 5 (AD-1). `r * 2` inteiro é o teste do
      // meio passo; 0,5 e seus múltiplos são exatos em binário.
      if (!Number.isFinite(r) || r < 0.5 || r > 5 || !Number.isInteger(r * 2))
        return NextResponse.json(
          { error: 'avaliação deve ir de 0,5 a 5, de meia em meia' },
          { status: 400 });
      set.my_rating = r;
    }
    if (body.myRating === null) set.my_rating = null;
    if (body.dateStarted !== undefined) set.date_started = body.dateStarted || null;
    if (body.dateFinished !== undefined) set.date_finished = body.dateFinished || null;

    if (body.progressPercent !== undefined && body.progressPercent !== null) {
      const p = Number(body.progressPercent);
      if (!Number.isInteger(p) || p < 0 || p > 100) {
        return NextResponse.json(
          { error: 'O progresso deve ser um inteiro entre 0 e 100' },
          { status: 400 });
      }
      set.progress_percent = p;
      set.progress_updated_at = new Date();
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

    if (Object.keys(set).length === 0 && body.nextUp === undefined
        && body.favorite === undefined)
      return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });

    // ─── Regras que dependem do estado atual ──────────────────
    // Lidas dentro da transação, e não recebidas do cliente: a tela pode
    // estar mostrando um estado velho — foi exatamente assim que o abandono
    // deixava de pegar — e decidir escrita pelo que o navegador acha que
    // sabe volta a errar sob rede lenta.
    const resultado = await withUser(userId, async (tx): Promise<Resultado> => {
      const [atual] = await tx
        .select({
          read_status: books.read_status,
          owned: books.owned,
        })
        .from(books)
        .where(eq(books.id, bookId))
        .limit(1);

      if (!atual) return { kind: 'nao-encontrado' };

      // O status que valerá ao fim deste pedido: o enviado, se houver, ou o
      // que já estava gravado.
      const statusFinal = (set.read_status as string | undefined)
        ?? atual.read_status;

      // Progresso entre 1 e 99 só promove livro que ainda não foi começado
      // (AD-3). Abandonado e lido mantêm o status.
      const p = set.progress_percent as number | undefined;
      if (p !== undefined && p >= 1 && p <= 99 && statusFinal === 'não lido') {
        set.read_status = 'lendo';
      }

      if (body.nextUp !== undefined) {
        if (body.nextUp === true && !atual.owned) {
          return {
            kind: 'conflito',
            mensagem: 'Só dá para pôr na fila um livro que você tem. '
              + 'Este ainda está em Quero ter.',
          };
        }
        set.next_up = body.nextUp === true;
      }

      if (body.favorite !== undefined) {
        if (body.favorite === true && statusFinal !== 'lido') {
          return {
            kind: 'conflito',
            mensagem: 'Favorito é para livro já lido. Marque como lido primeiro.',
          };
        }
        set.favorite = body.favorite === true;
      }

      // Virou lido: saiu da fila (AD-6). Não mexemos se o próprio pedido
      // disse o que fazer com a marca — a ordem explícita do dono vence.
      if (set.read_status === 'lido' && body.nextUp === undefined) {
        set.next_up = false;
      }

      await tx.update(books).set(set).where(eq(books.id, bookId));
      return { kind: 'ok' };
    });

    if (resultado.kind === 'nao-encontrado')
      return NextResponse.json({ error: 'livro não encontrado' }, { status: 404 });
    if (resultado.kind === 'conflito')
      return NextResponse.json({ error: resultado.mensagem }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Erro ao atualizar o livro');
  }
}
```

Note que o `.returning({ id: books.id })` saiu do update: quem responde 404 agora é o `select`, e a RLS já garante que o `select` só enxerga livros do dono.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test:run test/api/reading-patch.test.ts`
Expected: PASS. O caso antigo `salvar 45% marca o livro como lendo e carimba a data (AD-6)` continua passando porque o `livroAtual` padrão do `beforeEach` é `'não lido'`.

- [ ] **Step 6: Rodar a suíte de API inteira**

Run: `pnpm test:run test/api`
Expected: PASS. Se `test/api/books.test.ts` mockar a transação sem `select`, aplique o mesmo acréscimo do Step 1 lá.

- [ ] **Step 7: Commit**

```bash
git add app/api/books/[id]/route.ts test/api/reading-patch.test.ts
git commit -m "fix: abandono deixa de ser desfeito ao gravar progresso"
```

---

### Task 3: Meia estrela e marcações na API

**Files:**
- Modify: `app/api/books/[id]/route.ts` (só se algum teste abaixo revelar falta — a Task 2 já implementou o comportamento)
- Test: `test/api/marcacoes-patch.test.ts`

**Interfaces:**
- Consumes: o `PATCH` da Task 2.
- Produces: contrato confirmado — `{ myRating: 3.5 }`, `{ nextUp: true }`, `{ favorite: true }`.

- [ ] **Step 1: Escrever os testes**

Crie `test/api/marcacoes-patch.test.ts`. O preâmbulo (mocks, helper `PATCH`, `beforeEach`) é idêntico ao de `test/api/reading-patch.test.ts` depois da Task 2 — copie-o de lá, incluindo `livroAtual`, e acrescente:

```ts
describe('nota com meia estrela (AD-1)', () => {
  it('aceita 3,5', async () => {
    const res = await PATCH('1', { myRating: 3.5 });
    expect(res.status).toBe(200);
    expect(ultimoSet.my_rating).toBe(3.5);
  });

  it('aceita 0,5 e 5', async () => {
    await PATCH('1', { myRating: 0.5 });
    expect(ultimoSet.my_rating).toBe(0.5);
    await PATCH('1', { myRating: 5 });
    expect(ultimoSet.my_rating).toBe(5);
  });

  it('aceita limpar a nota', async () => {
    await PATCH('1', { myRating: null });
    expect(ultimoSet.my_rating).toBeNull();
  });

  it('recusa um quarto de estrela', async () => {
    expect((await PATCH('1', { myRating: 3.25 })).status).toBe(400);
  });

  it('recusa zero e recusa acima de cinco', async () => {
    expect((await PATCH('1', { myRating: 0 })).status).toBe(400);
    expect((await PATCH('1', { myRating: 5.5 })).status).toBe(400);
  });
});

describe('fila de próximos (AD-6)', () => {
  it('marca livro que o dono tem', async () => {
    livroAtual = { read_status: 'não lido', owned: true, next_up: false, favorite: false };
    const res = await PATCH('1', { nextUp: true });
    expect(res.status).toBe(200);
    expect(ultimoSet.next_up).toBe(true);
  });

  it('recusa livro que o dono não tem', async () => {
    livroAtual = { read_status: 'não lido', owned: false, next_up: false, favorite: false };
    const res = await PATCH('1', { nextUp: true });
    expect(res.status).toBe(409);
  });

  it('desmarcar não exige posse', async () => {
    livroAtual = { read_status: 'não lido', owned: false, next_up: true, favorite: false };
    const res = await PATCH('1', { nextUp: false });
    expect(res.status).toBe(200);
    expect(ultimoSet.next_up).toBe(false);
  });

  it('sai da fila sozinho ao virar lido', async () => {
    livroAtual = { read_status: 'lendo', owned: true, next_up: true, favorite: false };
    await PATCH('1', { readStatus: 'lido' });
    expect(ultimoSet.next_up).toBe(false);
  });

  it('sai da fila com o botão Terminei hoje', async () => {
    livroAtual = { read_status: 'lendo', owned: true, next_up: true, favorite: false };
    await PATCH('1', { finishedToday: true });
    expect(ultimoSet.next_up).toBe(false);
  });

  it('continua na fila ao virar lendo', async () => {
    livroAtual = { read_status: 'não lido', owned: true, next_up: true, favorite: false };
    await PATCH('1', { readStatus: 'lendo' });
    expect(ultimoSet.next_up).toBeUndefined();
  });
});

describe('favoritos (AD-7)', () => {
  it('marca livro lido', async () => {
    livroAtual = { read_status: 'lido', owned: true, next_up: false, favorite: false };
    const res = await PATCH('1', { favorite: true });
    expect(res.status).toBe(200);
    expect(ultimoSet.favorite).toBe(true);
  });

  it('recusa livro que não está lido', async () => {
    livroAtual = { read_status: 'lendo', owned: true, next_up: false, favorite: false };
    expect((await PATCH('1', { favorite: true })).status).toBe(409);
  });

  it('aceita marcar como lido e favoritar no mesmo pedido', async () => {
    livroAtual = { read_status: 'lendo', owned: true, next_up: false, favorite: false };
    const res = await PATCH('1', { readStatus: 'lido', favorite: true });
    expect(res.status).toBe(200);
    expect(ultimoSet.favorite).toBe(true);
  });

  it('não some quando o livro volta a lendo — releitura (AD-7)', async () => {
    livroAtual = { read_status: 'lido', owned: true, next_up: false, favorite: true };
    await PATCH('1', { readStatus: 'lendo' });
    expect(ultimoSet.favorite).toBeUndefined();
  });

  it('aceita desmarcar', async () => {
    livroAtual = { read_status: 'lido', owned: true, next_up: false, favorite: true };
    await PATCH('1', { favorite: false });
    expect(ultimoSet.favorite).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar**

Run: `pnpm test:run test/api/marcacoes-patch.test.ts`
Expected: PASS, todos. A Task 2 já implementou essas regras; estes testes existem para fixá-las contra regressão.

Se algum falhar, o defeito está na Task 2 — corrija `app/api/books/[id]/route.ts`, não o teste.

- [ ] **Step 3: Commit**

```bash
git add test/api/marcacoes-patch.test.ts
git commit -m "test: fixa regras de meia estrela, fila e favoritos"
```

---

### Task 4: Consultas das duas listas

**Files:**
- Modify: `lib/db/queries.ts` (ao fim do arquivo)
- Test: `test/db/proximos-favoritos-queries.test.ts`

**Interfaces:**
- Consumes: colunas da Task 1.
- Produces:
  - `interface LivroDaEstante { id: number; title: string; image_url: string | null; thumbhash: string | null; read_status: string; my_rating: number | null; owned: boolean; }`
  - `fetchNextUp(userId: string): Promise<LivroDaEstante[]>`
  - `fetchFavorites(userId: string): Promise<LivroDaEstante[]>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `test/db/proximos-favoritos-queries.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

// As queries usam `withUser`, que abre transação e fixa o usuário na sessão
// para a RLS. Nos testes de banco trocamos por uma passagem direta ao db da
// suíte, que já roda num schema isolado.
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(async (_uid: string, fn: (tx: unknown) => unknown) =>
    fn((globalThis as { __testDb: unknown }).__testDb)),
}));

beforeAll(async () => {
  ctx = await createTestDb();
  (globalThis as { __testDb: unknown }).__testDb = ctx.db;
  const [u] = await ctx.sql`
    insert into app_users (email) values ('estante@teste.com') returning id`;
  userId = u.id;

  await ctx.sql`
    insert into books (user_id, title, title_source, next_up, favorite, read_status, my_rating)
    values
      (${userId}, 'Na fila',      'Na fila',      true,  false, 'não lido', null),
      (${userId}, 'Também fila',  'Também fila',  true,  false, 'não lido', null),
      (${userId}, 'Favorito',     'Favorito',     false, true,  'lido',     4.5),
      (${userId}, 'Comum',        'Comum',        false, false, 'não lido', null)`;
});
afterAll(() => ctx.cleanup());

describe('fetchNextUp', () => {
  it('devolve só os livros marcados como próximos', async () => {
    const { fetchNextUp } = await import('@/lib/db/queries');
    const livros = await fetchNextUp(userId);
    expect(livros.map((l) => l.title).sort()).toEqual(['Na fila', 'Também fila']);
  });
});

describe('fetchFavorites', () => {
  it('devolve só os favoritos, com a nota fracionária', async () => {
    const { fetchFavorites } = await import('@/lib/db/queries');
    const livros = await fetchFavorites(userId);
    expect(livros).toHaveLength(1);
    expect(livros[0].title).toBe('Favorito');
    expect(Number(livros[0].my_rating)).toBe(4.5);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/db/proximos-favoritos-queries.test.ts`
Expected: FAIL — `fetchNextUp is not a function`.

- [ ] **Step 3: Implementar as consultas**

Acrescente ao fim de `lib/db/queries.ts`:

```ts
// — Estantes de fila e de favoritos —

export interface LivroDaEstante {
    id: number;
    title: string;
    image_url: string | null;
    thumbhash: string | null;
    read_status: string;
    my_rating: number | null;
    owned: boolean;
}

const colunasDaEstante = {
    id: books.id,
    title: books.title,
    image_url: books.image_url,
    thumbhash: books.thumbhash,
    read_status: books.read_status,
    my_rating: books.my_rating,
    owned: books.owned,
};

/** A fila de leitura: o que o dono decidiu ler antes dos outros. */
export async function fetchNextUp(userId: string): Promise<LivroDaEstante[]> {
    return withUser(userId, (tx) =>
        tx
            .select(colunasDaEstante)
            .from(books)
            .where(eq(books.next_up, true))
            .orderBy(books.title)
    );
}

/** A lista curta: lidos que superaram as expectativas. */
export async function fetchFavorites(userId: string): Promise<LivroDaEstante[]> {
    return withUser(userId, (tx) =>
        tx
            .select(colunasDaEstante)
            .from(books)
            .where(eq(books.favorite, true))
            .orderBy(books.title)
    );
}
```

As duas ordenam por título: sem ordem explícita na fila (não-objetivo da spec), alfabética é a única que não muda sozinha entre visitas.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/db/proximos-favoritos-queries.test.ts`
Expected: PASS, 2 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts test/db/proximos-favoritos-queries.test.ts
git commit -m "feat: consultas da fila de proximos e dos favoritos"
```

---

### Task 5: O sync do Calibre não toca nas colunas novas

**Files:**
- Test: `test/db/sync-schema.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `CatalogMetadata` e `metadataValues` de `lib/db/calibre-sync.ts`.
- Produces: nada.

- [ ] **Step 1: Escrever o teste**

Acrescente ao fim de `test/db/sync-schema.test.ts`:

```ts
describe('o sync não escreve dados de leitura', () => {
  it('metadataValues não devolve next_up nem favorite', async () => {
    const { metadataValues } = await import('@/lib/db/calibre-sync');
    const chaves = Object.keys(metadataValues({
      uuid: 'u', title: 'T', isbn: null, isbn13: null,
      publicationYear: null, publisher: null, series: null, seriesIndex: null,
      languageCode: null, description: null, genre: null, numPages: null,
      averageRating: null, lastModified: '2026-01-01',
    } as Parameters<typeof metadataValues>[0]));

    expect(chaves).not.toContain('next_up');
    expect(chaves).not.toContain('favorite');
    expect(chaves).not.toContain('my_rating');
    expect(chaves).not.toContain('read_status');
  });
});
```

Se `CalibreBookInput` exigir outros campos, o `pnpm typecheck` do Step 3 aponta quais — acrescente-os com valor nulo. Não mude o tipo para acomodar o teste.

- [ ] **Step 2: Rodar**

Run: `pnpm test:run test/db/sync-schema.test.ts`
Expected: PASS.

- [ ] **Step 3: Verificar tipos e commitar**

```bash
pnpm typecheck
git add test/db/sync-schema.test.ts
git commit -m "test: garante que o sync do Calibre nao toca marcacoes"
```

---

### Task 6: Componente de estrelas com meio passo

**Files:**
- Create: `components/estrelas.tsx`
- Test: `test/estrelas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `proximaNota(atual: number | null, estrela: number): number | null` — a nota que o próximo toque na estrela `estrela` deve gravar.
  - `<Estrelas nota={number | null} tamanho?: 'sm' | 'md' onEscolher?: (nota: number | null) => void />` — sem `onEscolher`, é só exibição.

- [ ] **Step 1: Escrever o teste da regra de toque**

Crie `test/estrelas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { proximaNota } from '@/components/estrelas';

describe('proximaNota (AD-2)', () => {
  it('primeiro toque grava a estrela cheia', () => {
    expect(proximaNota(null, 4)).toBe(4);
  });

  it('tocar de novo na mesma estrela tira meia', () => {
    expect(proximaNota(4, 4)).toBe(3.5);
  });

  it('um terceiro toque limpa a nota', () => {
    expect(proximaNota(3.5, 4)).toBeNull();
  });

  it('tocar em outra estrela grava aquela, cheia', () => {
    expect(proximaNota(4, 2)).toBe(2);
    expect(proximaNota(3.5, 5)).toBe(5);
  });

  it('funciona na primeira estrela, que tem meia como mínimo', () => {
    expect(proximaNota(null, 1)).toBe(1);
    expect(proximaNota(1, 1)).toBe(0.5);
    expect(proximaNota(0.5, 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/estrelas.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o componente**

Crie `components/estrelas.tsx`:

```tsx
'use client';

import { StarIcon } from 'lucide-react';

/**
 * O ciclo de um toque repetido na mesma estrela (AD-2): cheia → meia →
 * limpa. Tocar em outra estrela recomeça o ciclo naquela.
 *
 * A metade esquerda/direita do ícone foi rejeitada porque o alvo fica em
 * torno de 12px no celular, que é onde o dono usa o site.
 */
export function proximaNota(atual: number | null, estrela: number): number | null {
  if (atual === estrela) return estrela - 0.5;
  if (atual === estrela - 0.5) return null;
  return estrela;
}

/** Quanto da estrela `n` deve estar pintado, de 0 a 1. */
function preenchimento(nota: number | null, n: number): number {
  if (nota === null) return 0;
  if (nota >= n) return 1;
  if (nota >= n - 0.5) return 0.5;
  return 0;
}

function rotulo(nota: number | null, estrela: number): string {
  const alvo = proximaNota(nota, estrela);
  if (alvo === null) return 'Tirar a avaliação';
  return `Avaliar com ${String(alvo).replace('.', ',')}`;
}

function Estrela({ parte, classe }: { parte: number; classe: string }) {
  if (parte === 0) {
    return <StarIcon aria-hidden className={`${classe} text-gray-300`} />;
  }
  if (parte === 1) {
    return <StarIcon aria-hidden className={`${classe} fill-yellow-400 text-yellow-400`} />;
  }
  // Meia: a estrela cheia por cima da vazia, recortada ao meio. `clip-path`
  // acompanha o tamanho do ícone, então serve tanto à capa quanto à página.
  return (
    <span className={`relative inline-block ${classe}`}>
      <StarIcon aria-hidden className={`${classe} absolute inset-0 text-gray-300`} />
      <StarIcon
        aria-hidden
        className={`${classe} absolute inset-0 fill-yellow-400 text-yellow-400`}
        style={{ clipPath: 'inset(0 50% 0 0)' }}
      />
    </span>
  );
}

export function Estrelas({
  nota,
  tamanho = 'md',
  onEscolher,
}: {
  nota: number | null;
  tamanho?: 'sm' | 'md';
  onEscolher?: (nota: number | null) => void;
}) {
  const classe = tamanho === 'sm' ? 'h-3 w-3' : 'h-7 w-7';

  if (!onEscolher) {
    return (
      <span className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Estrela key={n} parte={preenchimento(nota, n)} classe={classe} />
        ))}
        <span className="sr-only">
          {nota === null
            ? 'Sem avaliação'
            : `Sua avaliação: ${String(nota).replace('.', ',')} de 5`}
        </span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={rotulo(nota, n)}
          onClick={() => onEscolher(proximaNota(nota, n))}
          className="p-1"
        >
          <Estrela parte={preenchimento(nota, n)} classe={classe} />
        </button>
      ))}
      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
        {nota === null ? 'sem nota' : String(nota).replace('.', ',')}
      </span>
    </div>
  );
}
```

O alvo de toque é a estrela inteira mais `p-1` de folga: em torno de 36px, acima do mínimo confortável para o dedo.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/estrelas.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add components/estrelas.tsx test/estrelas.test.ts
git commit -m "feat: componente de estrelas com meio passo"
```

---

### Task 7: Estrelas e marcas na capa

**Files:**
- Modify: `components/cover-badges.tsx` (arquivo inteiro)
- Modify: `components/photo.tsx:14-33` e `:51` (repassar as duas marcas)
- Modify: `components/grid.tsx:110-118`, `app/(main)/bibliotecas/[id]/page.tsx:58-66` (passar as props novas)

**Interfaces:**
- Consumes: `Estrelas` da Task 6.
- Produces: `<CoverBadges readStatus myRating owned nextUp favorite />` e `<Photo ... nextUp favorite />`, ambos com `nextUp` e `favorite` opcionais e padrão `false`.

- [ ] **Step 1: Reescrever CoverBadges**

Substitua `components/cover-badges.tsx` inteiro por:

```tsx
import { BookmarkIcon, HeartIcon } from 'lucide-react';
import { Estrelas } from './estrelas';

const STATUS_LABEL: Record<string, { texto: string; classe: string }> = {
  lido: { texto: 'Lido', classe: 'bg-emerald-600' },
  lendo: { texto: 'Lendo', classe: 'bg-amber-500' },
  abandonado: { texto: 'Abandonado', classe: 'bg-gray-600' },
};

export function CoverBadges({
  readStatus,
  myRating,
  owned = true,
  nextUp = false,
  favorite = false,
}: {
  readStatus: string | null;
  myRating: number | null;
  owned?: boolean;
  nextUp?: boolean;
  favorite?: boolean;
}) {
  const status = readStatus ? STATUS_LABEL[readStatus] : undefined;
  const nota = myRating === null ? null : Number(myRating);
  if (!status && nota === null && owned && !nextUp && !favorite) return null;

  return (
    <>
      {/* Canto direito: as três marcas quase nunca coexistem — "Quero ter" é
          livro que não se tem, a marca de próximo some quando o livro vira
          lido, e favorito exige lido. Empilham em linha se coincidirem. */}
      <div className="absolute right-1 top-1 flex items-center gap-1">
        {!owned && (
          <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
            Quero ter
          </span>
        )}
        {nextUp && (
          <span
            title="Na fila de leitura"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 shadow"
          >
            <BookmarkIcon aria-hidden className="h-3 w-3 fill-white text-white" />
            <span className="sr-only">Na fila de leitura</span>
          </span>
        )}
        {favorite && (
          <span
            title="Favorito"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 shadow"
          >
            <HeartIcon aria-hidden className="h-3 w-3 fill-white text-white" />
            <span className="sr-only">Favorito</span>
          </span>
        )}
      </div>

      {status && (
        <span
          className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow ${status.classe}`}
        >
          {status.texto}
        </span>
      )}

      {nota !== null && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/60 py-1">
          <Estrelas nota={nota} tamanho="sm" />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Repassar as props em Photo**

Em `components/photo.tsx`, acrescente `nextUp = false,` e `favorite = false,` à desestruturação de props (junto de `myRating = null,`), declare-os no tipo como `nextUp?: boolean; favorite?: boolean;`, e passe-os nas **duas** chamadas de `<CoverBadges>` (linhas 33 e 51):

```tsx
<CoverBadges
  readStatus={readStatus}
  myRating={myRating}
  owned={owned}
  nextUp={nextUp}
  favorite={favorite}
/>
```

- [ ] **Step 3: Passar as props nos dois lugares que montam capas**

Em `components/grid.tsx`, na `<Photo>` da linha 110, acrescente:

```tsx
                nextUp={book.next_up}
                favorite={book.favorite}
```

Em `app/(main)/bibliotecas/[id]/page.tsx`, na `<Photo>` da linha 58, acrescente:

```tsx
                nextUp={livro.next_up}
                favorite={livro.favorite}
```

Se o `pnpm typecheck` acusar que `next_up` não existe no tipo devolvido por `fetchCollectionBooks`, acrescente as duas colunas ao `select` em `lib/db/collections.ts:73` e ao tipo em `lib/db/collections.ts:18`, seguindo o padrão de `my_rating` que já está lá.

- [ ] **Step 4: Verificar tipos**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `pnpm test:run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/cover-badges.tsx components/photo.tsx components/grid.tsx "app/(main)/bibliotecas/[id]/page.tsx" lib/db/collections.ts
git commit -m "feat: meia estrela e marcas de fila e favorito na capa"
```

---

### Task 8: Página do livro — nota, abandono e marcações

**Files:**
- Modify: `app/(main)/[id]/tracking-controls.tsx` (arquivo inteiro)
- Modify: `app/(main)/[id]/progress-controls.tsx:33`, `:193-229` (tirar o motivo, esconder "Terminei hoje")
- Modify: `app/(main)/[id]/page.tsx:120-135` (passar os campos novos)

**Interfaces:**
- Consumes: `Estrelas` e `proximaNota` da Task 6; o `PATCH` da Task 2.
- Produces: `TrackingControls` recebe `initial` com `readStatus, dateStarted, dateFinished, myRating, dnfReason, nextUp, favorite, owned`.

- [ ] **Step 1: Reescrever TrackingControls**

Substitua `app/(main)/[id]/tracking-controls.tsx` inteiro por:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookmarkIcon, HeartIcon } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Estrelas } from '@/components/estrelas';

const READ_STATUS_OPTIONS = [
  { value: 'lido', label: '✅ Lido' },
  { value: 'lendo', label: '📖 Lendo' },
  { value: 'não lido', label: '🕐 Não lido' },
  { value: 'abandonado', label: '🚫 Abandonado' },
];

interface TrackingInitial {
  readStatus: string;
  dateStarted: string | null;
  dateFinished: string | null;
  myRating: number | null;
  dnfReason: string | null;
  nextUp: boolean;
  favorite: boolean;
  owned: boolean;
}

export function TrackingControls({
  bookId,
  initial,
}: {
  bookId: number;
  initial: TrackingInitial;
}) {
  const router = useRouter();
  const [readStatus, setReadStatus] = useState(initial.readStatus);
  const [dateStarted, setDateStarted] = useState(initial.dateStarted ?? '');
  const [dateFinished, setDateFinished] = useState(initial.dateFinished ?? '');
  const [myRating, setMyRating] = useState(initial.myRating);
  const [motivo, setMotivo] = useState(initial.dnfReason ?? '');
  const [nextUp, setNextUp] = useState(initial.nextUp);
  const [favorite, setFavorite] = useState(initial.favorite);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function update(body: Record<string, unknown>): Promise<boolean> {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Não foi possível salvar. Tente novamente.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('Falha de rede. Tente novamente.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function alternarProximo() {
    const alvo = !nextUp;
    setNextUp(alvo);
    // Reverter no erro: sem isso o botão fica mentindo sobre o que o banco
    // tem — e o dono só descobre na página da fila.
    if (!(await update({ nextUp: alvo }))) setNextUp(!alvo);
  }

  async function alternarFavorito() {
    const alvo = !favorite;
    setFavorite(alvo);
    if (!(await update({ favorite: alvo }))) setFavorite(!alvo);
  }

  return (
    <div className="border rounded-md p-4 mb-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label className="block mb-1">Status de leitura</Label>
          <Select
            value={readStatus}
            onValueChange={(value) => {
              setReadStatus(value);
              // Abandonar não some com a marca de favorito nem com o
              // progresso — só o status muda. Ver AD-3 e AD-7.
              void update({ readStatus: value });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {READ_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="block mb-1" htmlFor="date-started">
            Data de início
          </Label>
          <input
            id="date-started"
            type="date"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={dateStarted}
            onChange={(e) => {
              const value = e.target.value;
              setDateStarted(value);
              void update({ dateStarted: value || null });
            }}
          />
        </div>

        <div>
          <Label className="block mb-1" htmlFor="date-finished">
            Data de término
          </Label>
          <input
            id="date-finished"
            type="date"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={dateFinished}
            onChange={(e) => {
              const value = e.target.value;
              setDateFinished(value);
              void update({ dateFinished: value || null });
            }}
          />
        </div>
      </div>

      {/* O motivo nasce aqui, colado no seletor que o provocou (AD-4).
          Antes ele ficava no bloco de Progresso, longe o bastante para o
          dono não ver que tinha aparecido. */}
      {readStatus === 'abandonado' && (
        <div>
          <Label className="block mb-1" htmlFor="motivo-abandono">
            Por que abandonou?
          </Label>
          <textarea
            id="motivo-abandono"
            autoFocus
            className="flex w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Pode ser o motivo para voltar a ele um dia..."
          />
          <Button
            type="button"
            size="sm"
            className="mt-2"
            onClick={() => void update({ dnfReason: motivo })}
            disabled={isSaving}
          >
            Salvar motivo
          </Button>
        </div>
      )}

      <div>
        <Label className="block mb-1">Minha avaliação</Label>
        <Estrelas
          nota={myRating}
          onEscolher={(nota) => {
            setMyRating(nota);
            void update({ myRating: nota });
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {/* A fila é do que se tem: livro de "Quero ter" não entra (AD-6). */}
        {initial.owned && (
          <Button
            type="button"
            variant={nextUp ? 'default' : 'outline'}
            size="sm"
            onClick={() => void alternarProximo()}
            disabled={isSaving}
          >
            <BookmarkIcon className={`mr-2 h-4 w-4 ${nextUp ? 'fill-current' : ''}`} />
            {nextUp ? 'Na fila para ler' : 'Ler em seguida'}
          </Button>
        )}

        {/* Favorito é julgamento sobre livro lido (AD-7). */}
        {readStatus === 'lido' && (
          <Button
            type="button"
            variant={favorite ? 'default' : 'outline'}
            size="sm"
            onClick={() => void alternarFavorito()}
            disabled={isSaving}
          >
            <HeartIcon className={`mr-2 h-4 w-4 ${favorite ? 'fill-current' : ''}`} />
            {favorite ? 'Favorito' : 'Marcar como favorito'}
          </Button>
        )}
      </div>

      {isSaving && <p className="text-sm text-gray-500">Salvando...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Limpar o ProgressControls**

Em `app/(main)/[id]/progress-controls.tsx`:

1. Apague a linha 33 (`const [motivo, setMotivo] = useState(initial.dnfReason ?? '');`).
2. Apague o bloco inteiro `{initial.readStatus === 'abandonado' && ( ... )}` (linhas 207 a 229) — o motivo agora vive no bloco de status.
3. Troque a condição do botão "Terminei hoje" avulso (linha 193) de:

```tsx
      {initial.readStatus !== 'lido' && atual !== 100 && (
```

para:

```tsx
      {/* Em livro abandonado este botão é ruído, e um toque acidental
          desfaria o abandono (AD-4). */}
      {initial.readStatus !== 'lido' && initial.readStatus !== 'abandonado'
        && atual !== 100 && (
```

4. Troque também a condição do aviso de 100% (linha 125) de `{atual === 100 && initial.readStatus !== 'lido' && (` para:

```tsx
      {atual === 100 && initial.readStatus !== 'lido'
        && initial.readStatus !== 'abandonado' && (
```

5. Remova `dnfReason: string | null;` da interface `ProgressInitial` (linha 16). O campo passa a ser responsabilidade do bloco de status, e deixá-lo aqui convidaria alguém a renderizar a caixa de novo, recriando o problema de haver duas.

6. Em `app/(main)/[id]/page.tsx`, remova a linha `dnfReason: book.dnf_reason,` do objeto `initial` do `<ProgressControls>` (linha 141) — ela agora é passada ao `<TrackingControls>`, no Step 3.

- [ ] **Step 3: Passar os campos novos na página do livro**

`fetchBookById` (`lib/db/queries.ts:195`) **não** seleciona `owned`, `next_up` nem `favorite` — confirmado. Acrescente as três ao `select`, logo depois de `my_rating: books.my_rating,`:

```ts
                owned: books.owned,
                next_up: books.next_up,
                favorite: books.favorite,
```

Depois, em `app/(main)/[id]/page.tsx`, no objeto `initial` do `<TrackingControls>` (linha 126), acrescente:

```tsx
              dnfReason: book.dnf_reason,
              nextUp: book.next_up,
              favorite: book.favorite,
              owned: book.owned,
```

- [ ] **Step 4: Verificar tipos e lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 5: Conferir no navegador**

Run: `pnpm dev`

Abra um livro e confirme, nesta ordem:
1. Tocar duas vezes na 4ª estrela mostra 3,5 e o texto "3,5" ao lado.
2. Escolher "Abandonado" faz a caixa de motivo aparecer **e ficar**, com o cursor dentro.
3. Com o livro abandonado, salvar 50% no bloco de Progresso: o status continua "Abandonado", a caixa de motivo continua na tela, e a barra mostra 50%.
4. O livro não aparece mais na faixa "Lendo agora" da home.

- [ ] **Step 6: Commit**

```bash
git add "app/(main)/[id]/tracking-controls.tsx" "app/(main)/[id]/progress-controls.tsx" "app/(main)/[id]/page.tsx"
git commit -m "feat: meia estrela, motivo do abandono junto ao status e marcacoes na pagina do livro"
```

---

### Task 9: Páginas de Próximos e Favoritos

**Files:**
- Create: `components/estante.tsx`
- Create: `app/(main)/proximos/page.tsx`
- Create: `app/(main)/favoritos/page.tsx`
- Modify: `components/nav-bar.tsx:38` (dois itens novos)

**Interfaces:**
- Consumes: `fetchNextUp`, `fetchFavorites`, `LivroDaEstante` da Task 4; `Photo` da Task 7.
- Produces: `<Estante livros={LivroDaEstante[]} vazio={string} />`.

- [ ] **Step 1: Criar a grade compartilhada**

Crie `components/estante.tsx`:

```tsx
import Link from 'next/link';
import { Photo } from '@/components/photo';
import type { LivroDaEstante } from '@/lib/db/queries';

/** Grade de capas das estantes curtas (fila e favoritos). */
export function Estante({
  livros,
  vazio,
}: {
  livros: LivroDaEstante[];
  vazio: string;
}) {
  if (livros.length === 0) {
    return <p className="text-sm text-gray-500">{vazio}</p>;
  }

  return (
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
  );
}
```

As marcas de fila e favorito ficam de fora de propósito: numa página em que **todos** os livros têm a mesma marca, ela não distingue nada.

- [ ] **Step 2: Criar a página da fila**

Crie `app/(main)/proximos/page.tsx`:

```tsx
import { getCurrentUserId } from '@/lib/auth-user';
import { fetchNextUp } from '@/lib/db/queries';
import { Estante } from '@/components/estante';

export default async function ProximosPage() {
  const userId = await getCurrentUserId();
  const livros = await fetchNextUp(userId);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Próximos</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {livros.length} {livros.length === 1 ? 'livro' : 'livros'} na fila —
          o que você decidiu ler antes dos outros.
        </p>
      </div>

      <Estante
        livros={livros}
        vazio={'Nenhum livro na fila. Abra um livro e toque em "Ler em '
          + 'seguida", ou use o modo de seleção no acervo para marcar vários.'}
      />
    </div>
  );
}
```

- [ ] **Step 3: Criar a página dos favoritos**

Crie `app/(main)/favoritos/page.tsx`:

```tsx
import { getCurrentUserId } from '@/lib/auth-user';
import { fetchFavorites } from '@/lib/db/queries';
import { Estante } from '@/components/estante';

export default async function FavoritosPage() {
  const userId = await getCurrentUserId();
  const livros = await fetchFavorites(userId);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Favoritos</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {livros.length} {livros.length === 1 ? 'livro' : 'livros'} que
          superaram as expectativas.
        </p>
      </div>

      <Estante
        livros={livros}
        vazio={'Nenhum favorito ainda. Abra um livro que você já leu e toque '
          + 'em "Marcar como favorito".'}
      />
    </div>
  );
}
```

- [ ] **Step 4: Acrescentar os itens de menu**

Em `components/nav-bar.tsx`, entre o `<Link href="/bibliotecas">` e o `<Link href="/desejados">`, acrescente:

```tsx
      <Link
        href="/proximos"
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Próximos
      </Link>
      <Link
        href="/favoritos"
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Favoritos
      </Link>
```

O menu vai a seis itens e fica apertado no celular. É conhecido e aceito: reorganizá-lo é trabalho do ciclo de redesign, não deste.

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: sem erros, testes passando.

Com `pnpm dev`, visite `/proximos` e `/favoritos`: as duas devem carregar, mostrar o texto de vazio quando não há nada, e o menu deve levar às duas.

- [ ] **Step 6: Commit**

```bash
git add components/estante.tsx "app/(main)/proximos" "app/(main)/favoritos" components/nav-bar.tsx
git commit -m "feat: paginas de proximos e favoritos"
```

---

### Task 10: Marcar vários como próximos pelo acervo

**Files:**
- Modify: `components/grid.tsx:46-99` (ação nova) e `:161-185` (botão na barra)

**Interfaces:**
- Consumes: `PATCH /api/books/[id]` com `{ nextUp: true }`.
- Produces: nada.

- [ ] **Step 1: Acrescentar a ação**

Em `components/grid.tsx`, logo depois da função `adicionar` (que termina na linha 75), acrescente:

```tsx
  async function porNaFila() {
    if (selecionados.size === 0) return;
    setAviso(null);
    setSalvando(true);
    try {
      // Uma chamada por livro: a rota de livro já sabe recusar o que não é
      // possuído, e a seleção aqui é de punhado, não de acervo inteiro.
      const respostas = await Promise.all(
        [...selecionados].map((id) =>
          fetch(`/api/books/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nextUp: true }),
          })
        )
      );
      const ok = respostas.filter((r) => r.ok).length;
      const recusados = respostas.length - ok;
      setAviso(
        recusados === 0
          ? `${ok} livro(s) na fila.`
          : `${ok} na fila; ${recusados} recusado(s) — você ainda não tem esses.`
      );
      setSelecionados(new Set());
    } catch {
      setAviso('Falha de rede ao pôr na fila.');
    } finally {
      setSalvando(false);
    }
  }
```

- [ ] **Step 2: Mostrar o botão de seleção mesmo sem bibliotecas**

A barra de seleção hoje só aparece quando existe ao menos uma biblioteca (`components/grid.tsx:81`). Como agora ela também serve à fila, troque a condição:

```tsx
      {bibliotecas.length > 0 && (
```

por:

```tsx
      {/* A seleção agora serve também à fila, então não depende mais de
          existir alguma biblioteca criada. */}
      <div className="mb-3 flex items-center gap-3">
```

removendo o `)}` correspondente ao fim desse bloco (linha 99) e deixando só `</div>`.

- [ ] **Step 3: Acrescentar o botão na barra do rodapé**

Dentro da `<div className="ml-auto flex flex-wrap gap-2">` (linha 169), **antes** do `{bibliotecas.map(...)}`, acrescente:

```tsx
              <Button
                type="button"
                size="sm"
                disabled={salvando || selecionados.size === 0}
                onClick={() => void porNaFila()}
              >
                Ler em seguida
              </Button>
```

- [ ] **Step 4: Verificar**

Run: `pnpm typecheck && pnpm lint`
Expected: sem erros.

Com `pnpm dev`: no acervo, toque em "Selecionar", marque dois livros, toque em "Ler em seguida" e confirme o aviso; depois visite `/proximos` e veja os dois.

- [ ] **Step 5: Commit**

```bash
git add components/grid.tsx
git commit -m "feat: por varios livros na fila pelo modo de selecao"
```

---

### Task 11: Salto de página no acervo

**Files:**
- Modify: `components/book-pagination.tsx:70-72` (o texto vira formulário)
- Modify: `lib/url-state.ts` (função `paginaValida`)
- Modify: `app/(main)/page.tsx:25-33` (limite aplicado antes da consulta)
- Test: `test/paginacao.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `paginaValida(entrada: unknown, totalPaginas: number): number` exportada de `lib/url-state.ts`.

- [ ] **Step 1: Escrever o teste**

Crie `test/paginacao.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { paginaValida } from '@/lib/url-state';

describe('paginaValida (AD-8)', () => {
  it('devolve a página pedida quando ela existe', () => {
    expect(paginaValida('17', 42)).toBe(17);
  });

  it('limita ao total em vez de dar erro', () => {
    expect(paginaValida('99', 42)).toBe(42);
  });

  it('limita a 1 por baixo', () => {
    expect(paginaValida('0', 42)).toBe(1);
    expect(paginaValida('-3', 42)).toBe(1);
  });

  it('devolve 1 para lixo, que a barra de endereços permite digitar', () => {
    expect(paginaValida('abc', 42)).toBe(1);
    expect(paginaValida(undefined, 42)).toBe(1);
    expect(paginaValida('2.5', 42)).toBe(1);
  });

  it('devolve 1 quando não há nenhuma página', () => {
    expect(paginaValida('3', 0)).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:run test/paginacao.test.ts`
Expected: FAIL — `paginaValida is not a function`.

- [ ] **Step 3: Implementar**

Acrescente ao fim de `lib/url-state.ts`:

```ts
/**
 * A página pedida, limitada ao que existe. Um valor fora da faixa é preso ao
 * intervalo em vez de virar erro: pedir a página 99 de 42 leva à última, que
 * é o que a pessoa queria. Fica no servidor porque a URL é editável à mão.
 */
export function paginaValida(entrada: unknown, totalPaginas: number): number {
  const ultima = Math.max(1, totalPaginas);
  const n = Number(entrada);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, ultima);
}
```

- [ ] **Step 3b: Aplicar o limite antes da consulta, não depois**

Hoje `app/(main)/page.tsx:33` limita apenas a variável de exibição, enquanto `fetchBooksWithPagination` calcula o offset a partir do `page` cru. Pedir a página 99 de 42 mostraria "página 42" com a grade vazia. O limite precisa valer para a consulta.

Isso exige conhecer o total antes de buscar os livros, então o `Promise.all` das linhas 25 a 30 é dividido em dois. Substitua o trecho das linhas 25 a 33 por:

```tsx
  // O total vem primeiro: sem ele não dá para limitar a página pedida, e
  // consultar com uma página inexistente devolveria grade vazia enquanto a
  // paginação diz "página 42". Ver AD-8.
  const [estimatedTotal, bibliotecas, lendoAgora] = await Promise.all([
    estimateTotalBooks(userId, parsedSearchParams),
    fetchCollections(userId),
    fetchReadingNow(userId),
  ]);

  const totalPages = Math.ceil(estimatedTotal / ITEMS_PER_PAGE);
  const currentPage = paginaValida(parsedSearchParams.page, totalPages);

  const books = await fetchBooksWithPagination(userId, {
    ...parsedSearchParams,
    page: String(currentPage),
  });
```

E acrescente `paginaValida` ao import de `@/lib/url-state` na linha 12.

Custo honesto: uma ida a mais ao banco em série, porque a busca dos livros agora espera o total. É o preço de a tela e a consulta concordarem.

Ressalva conhecida: `estimateTotalBooks` usa `EXPLAIN` e erra (a spec do painel registra "estimou 1 onde havia 3"). Logo, `totalPages` é aproximado e o limite herda esse erro. Não pioramos nada — esse mesmo número já governa o texto da paginação e o botão `→` desabilitado. Ser consistente com ele é melhor que divergir dele.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:run test/paginacao.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Transformar o texto em campo**

Em `components/book-pagination.tsx`, substitua o bloco das linhas 70 a 72 por:

```tsx
        <Form action="/" className="flex items-center gap-2">
          {Object.entries(searchParams).map(
            ([key, value]) =>
              key !== 'page' && (
                <input key={key} type="hidden" name={key} value={value as string} />
              )
          )}
          <span className="text-sm text-muted-foreground">
            {totalResults.toLocaleString()} resultados · página
          </span>
          <label htmlFor="ir-para-pagina" className="sr-only">
            Ir para a página
          </label>
          <input
            id="ir-para-pagina"
            name="page"
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            defaultValue={currentPage}
            className="h-9 w-16 rounded-md border border-input bg-background px-2 text-center text-sm"
          />
          <span className="text-sm text-muted-foreground">
            de {totalPages.toLocaleString()}
          </span>
          <Button type="submit" variant="outline" size="sm">
            Ir
          </Button>
        </Form>
```

Não reutilize `FormValues` aqui: ele grava um `page` escondido, que colidiria com o campo visível — dois inputs de mesmo nome enviam os dois valores, e o servidor leria o errado.

- [ ] **Step 6: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: sem erros.

Com `pnpm dev`: no acervo, digite 3 no campo, toque em "Ir", e confirme que foi para a página 3 preservando busca e filtros. Depois peça uma página maior que o total e confirme que cai na última.

- [ ] **Step 7: Commit**

```bash
git add components/book-pagination.tsx lib/url-state.ts "app/(main)/page.tsx" test/paginacao.test.ts
git commit -m "feat: saltar para uma pagina do acervo sem editar a url"
```

---

### Task 12: Verificação final

**Files:** nenhum novo.

- [ ] **Step 1: Suíte inteira**

Run: `pnpm test:run`
Expected: PASS, sem testes pulados que não estivessem pulados antes.

- [ ] **Step 2: Tipos e lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 3: Build de produção**

Run: `pnpm build`
Expected: build concluído, com `/proximos` e `/favoritos` na lista de rotas.

- [ ] **Step 4: Passar o roteiro de aceitação da spec**

Com `pnpm dev`, na largura de um celular (DevTools, 390px):

1. Abrir um livro, dar 3,5 estrelas com dois toques.
2. Marcá-lo como abandonado, escrever um motivo, salvar.
3. Gravar 50% de progresso **depois** de abandonar — o status precisa continuar "Abandonado" e o motivo continuar na tela.
4. Voltar à home: o livro não está na faixa "Lendo agora".
5. Marcar três livros como próximos pelo modo de seleção e encontrá-los em `/proximos`.
6. Marcar um livro lido como favorito e encontrá-lo em `/favoritos`.
7. Saltar para a página 5 do acervo pelo campo da paginação.

- [ ] **Step 5: Lembrete de produção**

Depois do merge, o dono roda, nesta ordem (ver `docs/atualizar-acervo.md`):

```bash
pnpm db:migrate
pnpm db:import-calibre --email=wernersaboia@gmail.com --path="G:\Meu Drive\Livros"
```

A migração vem primeiro porque a importação escreve em colunas que ela cria.
