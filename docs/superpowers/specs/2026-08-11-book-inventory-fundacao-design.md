# Book Inventory — Spec 1: Fundação

**Data:** 2026-08-11
**Status:** Aprovado para planejamento
**Projeto:** 1 de 3 (ver Decomposição)

## Contexto

O Book Inventory é um catálogo pessoal de livros com leitor EPUB/PDF integrado, escrito em
Next.js 15 / React 19, com Postgres (Neon) + Drizzle, arquivos no Google Drive e auth via
NextAuth v5 com escopo `drive.readonly`.

Uma revisão do código em 2026-08-11 encontrou o projeto num estado de protótipo: a estrutura
está correta, mas a cadeia funcional está travada no primeiro elo. Uma consulta ao banco de
produção confirmou:

```
books              208     (todos com image_url apontando para C:\Livros — Calibre local)
authors            217
book_to_author     328

annotations          0
reading_progress     0
reading_sessions     0
drive_files          0
drive_settings       0
```

Os zeros não são coincidência. O import de EPUB executa
`onConflictDoNothing({ target: authors.name })` contra uma coluna sem constraint UNIQUE, o
que o Postgres rejeita com *"no unique or exclusion constraint matching the ON CONFLICT
specification"*. Nenhum livro jamais foi importado do Drive; sem `drive_files` nenhum livro é
legível; sem leitura não há progresso nem anotações.

Consequência prática: **não existe dado insubstituível no Neon.** Todo o conteúdo é
reproduzível com `pnpm db:import-calibre` a partir da biblioteca Calibre local. Isso torna
esta a janela mais barata que vai existir para corrigir o schema.

## Objetivo

Tirar o projeto do estado de protótipo e destravar a cadeia funcional, deixando o schema no
formato final para as specs seguintes.

**Critério de sucesso:** o usuário importa um livro do Google Drive, ele aparece no catálogo
com capa, e abre no leitor. Ponta a ponta, em produção, autenticado.

## Decomposição

Este é o primeiro de três projetos. Cada um tem spec, plano e ciclo próprios.

| Spec | Escopo | Estado |
|------|--------|--------|
| **1 — Fundação** | Supabase, segurança, schema final, cadeia de import/leitura, CI | este documento |
| **2 — Biblioteca de destaques** | Captura correta, tela de busca, comentários, exportação | a definir |
| **3 — Acompanhamento de leitura** | Marcar lido/lendo, heartbeat correto, métricas | a definir |

**Fora de escopo (candidatos a specs futuras):** PWA e leitura offline no celular; blog
público; compartilhamento com convites e perfis; revisão espaçada; metas anuais e
retrospectivas; OCR de PDFs escaneados.

### Prioridades declaradas pelo usuário

1. **Destaques e notas pesquisáveis depois da leitura** (prioridade máxima), com capacidade de
   comentar o destaque após a leitura, encontrados por **busca textual** — sem tags nem
   coleções por enquanto.
2. **Registro fiel de tempo e páginas lidas**, medido automaticamente.

Esta spec não implementa nenhuma das duas, mas cria o schema definitivo que ambas usam.

## Decisões de arquitetura

### AD-1 — Migrar para Supabase

**Decisão:** substituir o Neon pelo Supabase (Postgres + Storage).

**Motivo:** o projeto precisa de três coisas que o Supabase entrega junto — Postgres
gerenciado (equivalente ao Neon), object storage para as capas (hoje um bloqueador), e Row
Level Security para o compartilhamento futuro. Ambos rodam Postgres 17; Drizzle e as
migrations não mudam. Muda a connection string e o driver (`postgres-js` no lugar de
`@neondatabase/serverless`).

**Migração de dados:** nenhuma. O banco de destino nasce vazio e é populado por
`db:import-calibre`. O Neon é desligado depois da validação.

### AD-2 — Texto como verdade, localização como pista

**Decisão:** o texto destacado é a identidade do destaque; a posição no arquivo é um
`locator` JSONB best-effort.

**Alternativas descartadas:**
- *Localização como verdade* (schema atual, coluna `cfi`): amarra os destaques a um arquivo
  específico. Trocar a edição do EPUB, re-encodar no Drive ou substituir um PDF por uma
  versão com OCR invalida todos os destaques daquele livro.
- *Tabelas separadas por formato*: força `UNION` em toda query da biblioteca de destaques e
  duplica o índice full-text.

**Motivo:** um destaque comentado é conteúdo autoral do usuário, não um ponteiro para um
arquivo alheio hospedado no Google Drive. A biblioteca de destaques — a funcionalidade de
maior valor — consulta texto, não posição. A posição serve apenas ao "voltar ao livro", que
degrada com elegância quando o arquivo muda.

### AD-3 — Manter NextAuth, RLS por variável de sessão

**Decisão:** manter NextAuth v5 para autenticação. As policies de RLS leem
`current_setting('app.user_id')`, definido por transação.

**Alternativas descartadas:**
- *Trocar para Supabase Auth*: daria `auth.uid()` nativo, mas o token do Google Drive passaria
  a vir como `provider_token`, cujo refresh no Supabase é frágil — trocaria um problema em vias
  de ser resolvido (AD-4) por um problema conhecido.
- *Sem RLS, posse só na aplicação*: o isolamento passaria a depender de nunca esquecer um
  `where user_id = ...`. Inaceitável para um sistema que será compartilhado.

**Implementação:** um helper único centraliza o acesso ao banco.

```ts
// lib/db/with-user.ts
export async function withUser<T>(
  userId: string,
  fn: (tx: Transaction) => Promise<T>
): Promise<T>
```

Abre transação, executa `select set_config('app.user_id', $1, true)`, roda `fn`. O `true`
torna o escopo local à transação, o que é obrigatório em conexões pooled. Nenhuma query de
dados do usuário roda fora deste helper.

### AD-4 — Drive é a fonte, Storage é o acervo

**Decisão:** no import, arquivos abaixo do limite são copiados para o Supabase Storage e
servidos por signed URL. Acima do limite, permanecem apenas no Drive e são servidos por proxy
com repasse de `Range`.

**Limite:** `DRIVE_CACHE_MAX_BYTES`, padrão 50MB.

**Motivo:** hoje `/api/drive/read` encana o arquivo inteiro a cada abertura — um EPUB de 30MB
atravessa uma função serverless toda vez, sem cache e com risco de timeout. O import já baixa
o arquivo para ler metadados, então a cópia é gratuita. Ganhos: Range requests (o epub.js
carrega só o capítulo atual), CDN, e o arquivo passa a estar num lugar de onde o PWA offline
poderá cachear.

O usuário possui PDFs escaneados grandes, daí o limite. Acima dele o proxy repassa o header
`Range` para a API do Google (que suporta Range em `alt=media`), de modo que o react-pdf busque
só as páginas visíveis em vez de baixar o arquivo inteiro.

O contrato de `/api/drive/read` é idêntico nos dois casos — o leitor não sabe qual caminho foi
usado.

### AD-5 — Não criar as tabelas de tags

**Decisão:** nenhuma tabela de tags nesta spec.

**Motivo:** o usuário pediu o schema "preparado para tags depois". A preparação correta é não
criar nada: tags são uma tabela de junção (`tags` + `highlight_tags`) que não exige nenhuma
alteração em `highlights` para ser adicionada. Criar tabelas vazias agora produz código morto
que precisa ser mantido e testado, sem comprar flexibilidade.

## Modelo de dados

### Identidade

```sql
create table app_users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name       text,
  image      text,
  created_at timestamptz not null default now()
);
```

`user_id uuid not null references app_users(id)` é adicionado a `books`, `drive_files`,
`drive_settings`, `reading_progress` e `reading_sessions`. Sem backfill: o banco nasce vazio,
a coluna nasce `not null`.

### Destaques

A tabela `annotations` (0 linhas) é descartada e substituída por:

```sql
create table highlights (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid    not null references app_users(id) on delete cascade,
  book_id  integer not null references books(id)     on delete cascade,
  kind     text    not null check (kind in ('highlight','bookmark','note')),

  -- verdade
  text_content   text,
  context_before text,
  context_after  text,

  -- pista
  locator  jsonb   not null default '{}'::jsonb,
  progress numeric(5,4),

  color    text not null default '#ffff00',
  note     text,
  note_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  search_tsv tsvector generated always as (
    to_tsvector('portuguese',
      coalesce(text_content,'') || ' ' || coalesce(note,''))
  ) stored
);

create index on highlights using gin (search_tsv);
create index on highlights (user_id, created_at desc);
create index on highlights (user_id, book_id, progress);
```

Notas de desenho:

- **`locator` é JSONB.** EPUB grava `{"kind":"epub","cfi":"epubcfi(...)"}`; PDF grava
  `{"kind":"pdf","page":42}`. Um formato novo não exige migration.
- **`progress` (0..1) é coluna própria.** Permite ordenar os destaques na ordem do livro sem
  interpretar CFI — a lista ordena por número, não por string opaca.
- **`search_tsv` é coluna gerada**, dicionário `portuguese`. Mantida pelo Postgres; não há como
  esquecer de atualizar. "leitura" encontra "leituras" e "ler".
- **`kind`** distingue três coisas: `highlight` é trecho selecionado (tem `text_content`, pode
  ganhar `note` depois); `bookmark` é só posição (`text_content` nulo); `note` é anotação
  avulsa criada pelo usuário numa posição, sem trecho selecionado. A coluna `note` é o
  comentário em qualquer um dos três casos — não confundir com `kind = 'note'`.

### Busca do catálogo

`books.title_tsv` é hoje uma coluna `text` com índice GIN sobre
`to_tsvector('english', title_tsv)`, enquanto a query usa `title_tsv @@ to_tsquery(...)`. O
operador `text @@ tsquery` usa `default_text_search_config`, que não corresponde ao índice:
o índice nunca é usado e o dicionário está errado para um acervo em português.

Correção: `title_tsv` vira coluna gerada `tsvector` com dicionário `portuguese`, e
`to_tsquery` vira `websearch_to_tsquery`.

### Capas

`books.image_url` deixa de conter caminhos `C:\Livros\...` e passa a conter o caminho no
Supabase Storage. O `import-calibre.ts` ganha um passo de upload — já lê o `cover.jpg` e já
gera o thumbhash. A rota `/api/cover` é deletada.

## Segurança

| # | Problema | Correção |
|---|----------|----------|
| 1 | Qualquer conta Google acessa a biblioteca | Callback `signIn` valida contra `AUTH_ALLOWED_EMAILS` |
| 2 | `accessToken` e `refreshToken` do Drive expostos ao navegador via `useSession()` | Callback `session` para de copiá-los; acessor server-side `getDriveToken()` |
| 3 | Sem refresh — leitura quebra após ~1h | Callback `jwt` guarda `expiresAt` e renova com 5min de folga; falha vira `error: 'RefreshFailed'` e força relogin |
| 4 | `/api/cover` lê o filesystem com path hardcoded e checagem de prefixo furada | Rota deletada; capas no Storage |
| 6 | `/api/translate` sem rate limit (custo direto) | Tabela `api_usage (user_id, window_start, count)` com upsert atômico e teto horário por usuário |
| — | `Access-Control-Allow-Origin: *` em rota autenticada por cookie | Removido |
| — | `details: String(err)` vaza stack trace | Log estruturado no servidor; cliente recebe mensagem genérica + `requestId` |

O callback `signIn` é também o ponto de extensão para o compartilhamento futuro: convidar
alguém passa a ser adicionar um e-mail à lista.

## Correções funcionais

| # | Problema | Correção |
|---|----------|----------|
| 7 | `ON CONFLICT` em `authors.name` sem UNIQUE derruba todo import de EPUB | Id determinístico (slug do nome, como em `import-calibre.ts`); conflito resolvido na PK |
| 7b | `.returning()` vazio em conflito faz o vínculo livro↔autor ser pulado em silêncio | `select` do id existente quando o `returning` volta vazio |
| 8 | `image_url` gravado como `/api/cover/{id}.png?data={base64}` — rota inexistente, capa inteira em base64 na URL | Upload para o Storage; grava a URL pública |
| 9 | PDFs são listados pelo Drive e o leitor existe, mas o import rejeita com "Formato não suportado" | Import aceita `application/pdf`: título do nome do arquivo, páginas via `pdfjs`, sem capa |
| 10 | `to_tsquery` com input cru — `O'Brien` ou `:` geram 500 na home | `websearch_to_tsquery` |
| 11 | Índice GIN nunca usado; dicionário `english` em acervo português | Coluna gerada `tsvector` com dicionário `portuguese` |
| 16 | `fetchBookById` pode retornar `undefined` sem `notFound()`; non-null assertions sobre colunas nullable | `notFound()` e remoção dos `!` |
| — | `dotenv.config()` no bundle de produção | Removido de `lib/db/drizzle.ts`; permanece nos scripts `tsx` |
| — | `nextPageToken` do Drive ignorado (limite de 100 arquivos por pasta) | Paginação na listagem |

Ficam para a Spec 2 (dependem da tela de destaques): captura do `cfiRange` correto (#13) e o
vazamento do timer de progresso (#14). Ficam para a Spec 3: heartbeat em segundos (#12) e
marcar livro como lido.

## Fluxo de dados

**Import (Drive → catálogo)**

1. Usuário autenticado seleciona pasta e arquivo em `/settings`
2. `POST /api/drive/import` obtém o token via `getDriveToken()`
3. Baixa o arquivo para memória
4. EPUB: `parseEpubMetadata` extrai título, autores, idioma, editora, ISBN e capa
   PDF: título do nome do arquivo, contagem de páginas via `pdfjs`
5. Dentro de `withUser`: insere `books`, `authors`, `book_to_author`, `drive_files`
6. Sobe a capa para o Storage; grava `image_url`
7. Se `size < DRIVE_CACHE_MAX_BYTES`: sobe o arquivo para o Storage e marca
   `drive_files.cached_path`

**Leitura (catálogo → leitor)**

1. `/read/[id]` ou `/read/pdf/[id]` pede `/api/drive/read?bookId=N`
2. A rota resolve `drive_files` dentro de `withUser` (o RLS garante a posse)
3. Com `cached_path`: redirect 302 para signed URL do Storage
   Sem `cached_path`: proxy da API do Google repassando o header `Range`
4. O leitor não distingue os dois casos

## Tratamento de erros

- **Token do Drive expirado ou revogado:** o callback `jwt` marca `RefreshFailed`; o app
  redireciona para `/login` com mensagem explicando que o acesso ao Drive precisa ser
  reautorizado. Nunca 401 silencioso.
- **Arquivo removido do Drive:** o proxy devolve 404 e a UI oferece re-importar. O registro em
  `books` e os destaques permanecem — eles não dependem do arquivo (AD-2).
- **Import de arquivo corrompido:** `parseEpubMetadata` falha, a transação inteira rola para
  trás, nada de meio-livro no catálogo.
- **Livro já importado:** 409 com o id do livro existente, e a UI leva até ele em vez de só
  mostrar erro.
- **Storage cheio:** o import continua sem cache (o livro fica servido por proxy) e loga aviso.
  Nunca falha o import por causa do cache.
- **Erros em rotas:** log estruturado com `requestId` no servidor; resposta genérica ao
  cliente.

## Testes

Vitest, focado no que comprovadamente quebrou:

- `parseEpubMetadata` contra fixtures reais, incluindo EPUB malformado e sem capa
- Import: autor novo, autor duplicado (o caso do bug #7), livro já importado, PDF, arquivo
  acima do limite de cache
- Filtros de busca: `O'Brien`, acentos, string vazia, `:`, `&` — os casos que hoje devolvem 500
- Refresh de token: token válido, prestes a expirar, refresh falhando
- **RLS:** um teste que prova que o usuário B não lê os destaques nem os livros do usuário A.
  Este é o teste que justifica a existência do RLS.

**CI (GitHub Actions):** `tsc --noEmit`, ESLint, Vitest em cada push.

**Dependências:** `typescript`, `drizzle-kit`, `tsx` e `@types/node` movidos de `dependencies`
para `devDependencies`.

## Observação registrada: PDFs escaneados

O usuário possui PDFs escaneados. Estes não têm camada de texto — são imagem. Neles não é
possível selecionar trecho, portanto não é possível destacar nem traduzir, e o
`renderTextLayer` do react-pdf não tem conteúdo para renderizar. Nenhuma decisão de
arquitetura desta spec altera isso.

A solução seria OCR aplicado uma vez no import, com a camada de texto persistida. Isso tem
custo e latência reais e constitui um projeto próprio, fora de escopo aqui. Fica registrado
porque, se a maior parte do acervo do usuário for escaneada, isso reordena o valor entre a
Spec 2 (biblioteca de destaques) e um eventual projeto de OCR.

## Variáveis de ambiente

```
POSTGRES_URL              # Supabase — connection string pooled
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY # server-side apenas, para o Storage
AUTH_SECRET               # regerar (o atual foi exposto em sessão de trabalho)
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
AUTH_ALLOWED_EMAILS       # lista separada por vírgula
GOOGLE_TRANSLATE_API_KEY  # opcional
DRIVE_CACHE_MAX_BYTES     # padrão 52428800 (50MB)
TRANSLATE_HOURLY_LIMIT    # padrão 200 requisições/hora por usuário
```

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Quota de 1GB do Storage no plano free do Supabase | Limite de 50MB por arquivo; PDFs grandes ficam no Drive. Monitorar após o primeiro import completo |
| RLS por GUC exige transação em toda query | Helper `withUser` como único ponto de acesso; teste de isolamento no CI |
| Import do Calibre depende da máquina Windows local | Aceito — é operação manual e pontual, roda uma vez |
| Refresh do token do Google é o ponto único de falha da leitura | Testes dos três caminhos; erro explícito na UI em vez de falha silenciosa |
