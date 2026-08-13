# Book Inventory — Spec: Reescopo para Rastreador Pessoal (sem Drive, sem Google)

**Data:** 2026-08-13
**Status:** Aprovado para planejamento
**Antecede:** substitui as Specs 2 e 3 previstas (biblioteca de destaques / acompanhamento de leitura), reescopando o produto.

## Contexto

A Spec 1 (Fundação) foi entregue e mergeada em `main` (PR #1): Supabase + Drizzle, RLS por
usuário, import do Calibre, catálogo, busca em português, e uma camada de integração com o
Google Drive (login Google, leitor EPUB/PDF, tradução).

Ao usar o resultado, o dono do projeto redefiniu o objetivo. O que ele quer, de fato, é um
**rastreador pessoal de leitura** — um "StoryGraph só meu": catalogar os livros que possui
(dados vindos do Calibre), marcar o que leu / está lendo, avaliar e anotar. **Não** quer ler
os arquivos dentro do site, **não** quer depender do Google, e **não** quer exigir conta
Google de ninguém caso um dia compartilhe.

Isso torna a camada Google/Drive/leitor — a parte mais frágil da Fundação (refresh de token,
streaming de arquivo, proxy de Range) — desnecessária. O reescopo **remove** essa camada e
**mantém** o núcleo (banco, schema, RLS, import do Calibre, catálogo, busca).

Fato relevante: a etapa manual de produção da Spec 1 (migrate + import contra o Supabase)
nunca foi executada. O banco Supabase de produção está **vazio**. Portanto não há dados reais
para migrar de identidade — o primeiro import real acontecerá já sob a conta do Supabase Auth.

## Objetivo

Transformar o projeto num rastreador pessoal de leitura, sem Google e sem Drive, com login por
e-mail/senha, alimentado pela biblioteca Calibre local.

**Critério de sucesso:** o dono entra com e-mail/senha, vê seu catálogo (capas + metadados
vindos do Calibre), e consegue — pelo site — marcar um livro como lido/lendo, registrar datas,
dar uma nota pessoal e escrever notas. Sem nenhuma dependência de Google.

## Não-objetivos (fora de escopo)

- Ler arquivos de livro dentro do site (leitor EPUB/PDF) — **removido, sem volta prevista**.
- Google Drive, login Google, tradução integrada.
- Multiusuário real com bibliotecas de terceiros. O modelo é single-user; a RLS permanece
  como fundação para um eventual compartilhamento somente-leitura do próprio catálogo, mas
  nenhuma UI de convite/compartilhamento entra aqui.
- Biblioteca de destaques com busca cross-livro e revisão espaçada (pode voltar como spec
  futura; a v1 tem notas por livro).

## Decomposição

Uma spec, dois passos — o Passo 1 já entrega um catálogo utilizável e sem Google:

| Passo | Escopo | Resultado |
|-------|--------|-----------|
| **1 — Reescopo** | Supabase Auth (e-mail/senha); remover Drive/leitor/tradução; podar schema; import do Calibre sob a nova identidade | Catálogo funciona, login e-mail/senha, zero Google |
| **2 — Tracking UI** | Telas para status, datas, avaliação pessoal, notas; estatísticas recalculadas | O rastreador de fato |

## Decisões de arquitetura

### AD-1 — Supabase Auth (e-mail/senha) no lugar do NextAuth-Google

**Decisão:** autenticação por e-mail/senha via Supabase Auth (`@supabase/ssr` +
`@supabase/supabase-js`). Remover o NextAuth e o provider Google por completo.

**Alternativas descartadas:**
- *Supabase Auth com RLS nativa (`auth.uid()`)*: exigiria reescrever as policies de RLS (a
  parte mais delicada de acertar) e mudar como a conexão Drizzle passa identidade. Para um
  usuário só, retrabalho sem retorno.
- *NextAuth com provider de credenciais*: menor diff, mas implicaria implementar hash e
  armazenamento de senha à mão — segurança sensível que o Supabase já resolve pronto.

**Conta única:** não há cadastro público. A conta do dono é criada uma vez no painel do
Supabase. A página de login é só um formulário de entrada.

### AD-2 — A RLS/`withUser` não muda; só a fonte de identidade

**Decisão:** manter o helper `withUser(userId, fn)` e as policies de RLS da migration `0007`
exatamente como estão. O que muda é `getCurrentUserId()`: passa a ler a sessão do Supabase
(server-side, via `supabase.auth.getUser()`) e a devolver o **uid do Supabase Auth**.

**Chave da coerência:** `app_users.id` passa a **ser** o uid do Supabase Auth. No primeiro
login, um upsert garante a linha `app_users` com esse id. Assim `books.user_id` (e as demais
FKs) apontam para o uid do Supabase, e as policies `user_id = app_current_user_id()` casam sem
nenhuma alteração. Como o banco está vazio, não há backfill.

**Risco preservado baixo:** o mecanismo de isolamento — o mais caro de acertar — permanece
intacto e coberto pelos testes de RLS existentes; troca-se apenas quem fornece o `userId`.

### AD-3 — Remover a camada Drive/leitor/tradução

**Decisão:** excluir tudo que só existia para ler arquivos ou falar com o Drive/Google.

Removidos:
- `lib/auth.ts` (NextAuth Google), `lib/auth-tokens.ts`, `app/api/auth/[...nextauth]`
- `app/api/drive/*` (folders, list, import, read), `lib/drive.ts`, `lib/import-book.ts`
- `app/read/*` (leitores EPUB e PDF), `app/read/layout.tsx`
- `lib/ebook.ts`, `lib/pdf-meta.ts`
- `app/api/translate`, `components/translation-popup.tsx`, `lib/rate-limit.ts`
- `app/api/reading/heartbeat`, `app/api/reading/progress` (telemetria de leitor). A rota
  `app/api/reading/annotations` é **substituída** pela nova rota de notas
  (`/api/books/[id]/notes`); `app/api/reading/stats` é **mantida e simplificada** (Passo 2).
- Em `lib/storage.ts`: `uploadBookFile`, `createSignedUrl`, `BOOKS_BUCKET`. **Mantém**
  `uploadCover`, `COVERS_BUCKET`.
- `components/annotations-panel.tsx` (era do leitor) — a UI de notas nasce nova no Passo 2.

`authorId` (hoje em `lib/import-book.ts`) migra para um util neutro (`lib/authors.ts` ou
similar), pois o `import-calibre.ts` depende dele.

### AD-4 — Ingestão pelo Calibre, sem Drive

**Decisão:** o `import-calibre.ts` continua sendo a via de ingestão — lê o SQLite do Calibre
local, sobe capas ao Supabase Storage, insere metadados. Já é livre de Drive. Ajuste único:
resolver o `app_users` do dono pela conta Supabase (por e-mail, contra a linha upsertada no
primeiro login), em vez de criar identidade própria.

## Modelo de dados

### `app_users`
`id` passa a ser o uid do Supabase Auth (uuid). Demais colunas inalteradas. Upsert no primeiro
login.

### `books` — acréscimos de tracking
```sql
ALTER TABLE books ADD COLUMN my_rating   integer;      -- avaliação pessoal 1..5 (nullable)
ALTER TABLE books ADD COLUMN date_started date;         -- início de leitura (nullable)
ALTER TABLE books ADD COLUMN date_finished date;        -- fim de leitura (nullable)
ALTER TABLE books ADD CONSTRAINT books_my_rating_range CHECK (my_rating BETWEEN 1 AND 5);
```
`read_status` (já existe) e `average_rating` (nota do Goodreads, só exibição) permanecem.
`my_rating` é a avaliação pessoal, distinta da do Goodreads.

### `highlights` → notas por livro
A tabela vira "notas": uma citação opcional (`text_content`) + o comentário (`note`). As
colunas específicas do leitor perdem sentido e são removidas para manter a tabela limpa:
```sql
ALTER TABLE highlights DROP COLUMN locator;
ALTER TABLE highlights DROP COLUMN progress;
ALTER TABLE highlights DROP COLUMN context_before;
ALTER TABLE highlights DROP COLUMN context_after;
ALTER TABLE highlights DROP COLUMN note_updated_at;
```
`kind` passa a admitir `'note'` e `'quote'` (o check é atualizado; `'bookmark'`/`'highlight'`
saem). `search_tsv` (gerado, português, sobre `text_content` + `note`) permanece — a busca de
notas continua funcionando.

### Tabelas removidas
`drive_files`, `drive_settings`, `api_usage`, `reading_progress`, `reading_sessions` — sem
consumidores após a remoção da camada Drive/leitor/tradução. Uma migration as dropa.

As estatísticas deixam de usar minutos/streak (telemetria de leitor) e passam a derivar de
`read_status` + `date_finished`.

## Componentes e fluxo

### Autenticação
- `lib/supabase/server.ts` e `lib/supabase/client.ts`: clientes Supabase (SSR e browser).
- `getCurrentUserId()`: server-side, lê a sessão, garante `app_users` (upsert), devolve o uid.
- `middleware.ts`: protege as rotas exigindo sessão Supabase; sem sessão → `/login`.
- `app/login/page.tsx`: formulário e-mail/senha (entrar). Sem cadastro público.

### Tracking UI (Passo 2)
1. **Página do livro** (`app/(main)/[id]/page.tsx`): controles para
   - `read_status` (lido / lendo / não lido)
   - `date_started` / `date_finished`
   - `my_rating` (1–5 estrelas)
   Persistidos via `PATCH /api/books/[id]`, dentro de `withUser`.
2. **Notas** (na mesma página): listar, criar, editar e apagar notas do livro
   (`GET/POST/PATCH/DELETE /api/books/[id]/notes`), tudo em `withUser` — o RLS garante posse e
   fecha IDOR por construção.
3. **Estatísticas** (`app/api/reading/stats` reaproveitado e simplificado): total, lendo,
   lidos, não lidos, páginas lidas (soma de `num_pages` onde `read_status='lido'`), e lidos por
   ano (a partir de `date_finished`), tudo sob `withUser`.

### Ingestão
`pnpm db:import-calibre --email=<sua conta supabase>` — roda da máquina do dono, popula
`books`/`authors`/capas sob o `app_users` do dono.

## Tratamento de erros

- **Sem sessão Supabase:** middleware redireciona a `/login`; rotas de API respondem 401 via
  `errorResponse`.
- **Erros de rota:** mantém `lib/errors.ts` (log estruturado + `requestId`, mensagem genérica
  ao cliente).
- **Import de Calibre:** falha de capa não derruba o livro (padrão já estabelecido na Fundação:
  Storage nunca aborta a ingestão).
- **`my_rating` fora de 1–5 / datas incoerentes:** validado na rota antes do banco; o CHECK do
  banco é a última linha de defesa.

## Testes

- **RLS ainda isola:** reaproveitar/ad-equar `test/db/rls.test.ts` ao novo `highlights` (notas)
  e às colunas novas de `books`; provar que o usuário B não lê/edita dados de A.
- **Rotas de tracking:** `PATCH` de status/datas/rating e CRUD de notas rodam em `withUser`
  (mesmo padrão de teste das rotas de reading corrigidas na Fundação); `my_rating` inválido →
  400; nota sem id no DELETE → 400; sem sessão → 401.
- **Estatísticas:** contagens corretas a partir de `read_status`/`date_finished` em dados de
  fixture.
- **Auth:** `getCurrentUserId` devolve o uid do Supabase e faz upsert de `app_users` no
  primeiro acesso.
- **Import do Calibre:** `resolveUserId` casa com a conta Supabase existente; capas via
  `uploadCover`; nunca grava caminho local em `image_url`.
- CI (typecheck + lint + testes) permanece gate bloqueante.

## Dependências

**Removidas:** `next-auth`, `epubjs`, `react-pdf`, `fast-xml-parser` (era do parser EPUB).
**Adicionadas:** `@supabase/ssr` (o `@supabase/supabase-js` já existe).
**Mantidas:** `sharp`, `thumbhash`, `unlazy` (capas), `sql.js` (import do Calibre), Drizzle,
`postgres`.

## Migrações

- `ALTER TABLE books` (colunas de tracking + check de `my_rating`).
- `ALTER TABLE highlights` (dropar colunas de leitor; atualizar o check de `kind`).
- `DROP TABLE` das 5 tabelas mortas.
- Atualizar `lib/db/schema.ts` e o snapshot correspondente; `pnpm db:generate` deve ficar
  consistente.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| A troca de identidade (Google→Supabase) quebrar o casamento da RLS | `app_users.id` = uid do Supabase; banco vazio, sem backfill; testes de RLS revalidados |
| Remoção ampla de arquivos deixar imports órfãos e quebrar o build | Remoção guiada por `grep`/typecheck; CI bloqueante pega qualquer resíduo |
| Perda acidental de código ainda útil ao remover a camada Drive | `authorId` e `uploadCover`/`COVERS_BUCKET` explicitamente preservados nesta spec |
| Corte de produção da Fundação (book_app/POSTGRES_URL) ainda pendente | Continua válido e necessário; a RLS só protege em produção conectando como `book_app`, não `postgres` |
