# Book Inventory — Spec: página Leituras (lidos e abandonados)

**Data:** 2026-08-18
**Status:** Aprovado para planejamento
**Sucede:** a navegação mobile (barra fixa + menu "Mais") e as correções de busca

## Contexto

O dono pediu "visualizar e editar os livros lidos, assim como também visualizar quais
livros foram abandonados". A leitura do código mostrou que **as duas capacidades já
existem**:

- **Editar já funciona.** `app/(main)/[id]/tracking-controls.tsx` edita status de leitura,
  data de início, data de término, nota em estrelas e motivo de abandono, gravando via
  `PATCH /api/books/[id]`.
- **Filtrar já funciona.** `statusFilter` em `lib/db/queries.ts` atende
  `?status=lido` e `?status=abandonado`, e o painel de Filtros expõe as quatro opções.

Perguntado sobre qual era a dor real — achar, ver de relance, ou editar em lote — o dono
respondeu **achar**: a capacidade existe, mas está enterrada no painel de Filtros, enquanto
Favoritos e Próximos têm lugar próprio na navegação.

O acervo tem hoje ~27 lidos (dos quais 17 sem data de término registrada) e ~8 abandonados.

## Objetivo

Dar ao histórico de leitura um lugar próprio na navegação, no mesmo padrão de Favoritos e
Próximos.

**Critério de sucesso:** o dono alcança a lista de lidos e a de abandonados pela navegação,
sem abrir o painel de Filtros.

## Não-objetivos

- **Edição em lote pela lista.** Perguntado, o dono não escolheu esta dor; editar continua
  sendo pela página do livro, que já faz isso.
- **Mostrar o motivo do abandono na grade.** O pedido foi "visualizar quais livros foram
  abandonados"; o motivo já aparece na página do livro. Fácil de acrescentar depois se a
  lista se mostrar pobre sem ele.
- **Paginação.** 27 e 8 livros cabem numa tela; `Estante` (usada por Favoritos e Próximos)
  também não pagina.
- **Mudar a barra fixa do celular.** O dono escolheu o menu "Mais" em vez de trocar um dos
  cinco lugares da barra.
- **Nova rota de API, coluna ou migração.** A feature é só leitura sobre dados existentes.

## Decisões de arquitetura

### AD-1 — Uma página com abas por query param, não duas rotas

**Decisão:** `/leituras` renderiza a aba Lidos por padrão; `?aba=abandonados` renderiza a
dos abandonados. `?aba=lidos` é aceito e equivale ao default, para o link da aba ativa ser
sempre explícito. As abas são dois `<Link>` — sem estado de cliente, sem `'use client'`.
Qualquer outro valor de `aba`, inclusive ausente, cai em Lidos.

**Motivo:** o dono escolheu "uma página Leituras com abas" em vez de duas páginas separadas.
Query param em vez de rotas aninhadas (`/leituras/lidos`) evita um layout intermediário só
para desenhar duas abas, mantém a URL compartilhável, e deixa o servidor buscar **apenas** a
lista ativa — a alternativa de abas no cliente buscaria as duas listas para exibir uma.

Cair no default em vez de dar 404 segue o princípio já adotado em `paginaValida`
(`lib/url-state.ts`): a URL é editável à mão, e um valor torto não deve quebrar a página.

### AD-2 — Duas consultas irmãs de `fetchFavorites`, sem tipo novo

**Decisão:** `fetchLidos(userId)` e `fetchAbandonados(userId)` em `lib/db/queries.ts`,
reusando `colunasDaEstante` e devolvendo `LivroDaEstante[]` — as mesmas peças que
`fetchNextUp` e `fetchFavorites` já usam. Nenhuma mudança em `LivroDaEstante`.

**Ordenação:**
- `fetchLidos`: `date_finished` **descendente com nulos por último**, depois título.
- `fetchAbandonados`: título, como as demais estantes.

**Motivo:** um histórico de leitura é naturalmente cronológico — o que se acabou de ler vem
primeiro. Como 17 dos 27 lidos não têm `date_finished`, nulos por último os agrupa no fim em
ordem alfabética, em vez de os empurrar para o topo (que é onde `DESC` os põe por padrão no
Postgres) ou de os esconder.

### AD-3 — O menu "Mais" passa a derivar de `LINKS`

**Decisão:** `components/mobile-more-menu.tsx` para de listar Favoritos e Configurações à
mão e passa a derivar seus itens de `LINKS` (exportado por `components/nav-bar.tsx`),
excluindo os que já estão na barra fixa: `LINKS.filter(l => !HREFS_BARRA.includes(l.href))`.
`HREFS_BARRA` sai de `mobile-tab-bar.tsx` para um módulo que os dois importam, evitando
dependência circular. O alternador de tema e "Sair" continuam fixos no painel — não são
rotas e não estão em `LINKS`.

**Motivo:** hoje `MobileTabBar` deriva de `LINKS` mas `MobileMoreMenu` repete as rotas na
mão — a revisão de branch da spec anterior registrou isso como risco. Com a duplicação,
acrescentar "Leituras" a `LINKS` faria a seção aparecer no desktop e **sumir silenciosamente
no celular**, sem erro de tipo nem de execução. Esta spec é a primeira a acrescentar uma
seção desde que a navegação mobile existe, ou seja, é a primeira que dispararia a falha.
Derivando, "toda seção aparece na barra ou no Mais" passa a valer por construção.

Melhoria dirigida ao código que a feature já toca, não refatoração oportunista: sem ela, a
própria feature nasce quebrada no celular.

## Modelo de dados

**Nenhuma mudança.** Colunas já existentes:

| Coluna | Uso |
|---|---|
| `read_status` | Seleciona `'lido'` / `'abandonado'` (AD-2) |
| `date_finished` | Ordena os lidos (AD-2) |
| `my_rating`, `image_url`, `thumbhash`, `owned` | Já em `colunasDaEstante`; o `Photo` desenha selo e estrelas |

## Componentes e arquivos afetados

| Arquivo | Mudança |
|---|---|
| `lib/db/queries.ts` | **Novo:** `fetchLidos`, `fetchAbandonados` (AD-2) |
| `app/(main)/leituras/page.tsx` | **Novo:** página com as abas e o cabeçalho de contagem (AD-1) |
| `components/nav-bar.tsx` | Acrescenta `/leituras` a `LINKS`; `HREFS_BARRA` passa a morar aqui (AD-3) |
| `components/mobile-tab-bar.tsx` | Importa `HREFS_BARRA` em vez de declará-lo (AD-3) |
| `components/mobile-more-menu.tsx` | Deriva os itens de `LINKS` menos `HREFS_BARRA` (AD-3) |
| `test/db/leituras.test.ts` | **Novo:** cobre as duas consultas (AD-2) |

`components/estante.tsx`, `components/photo.tsx` e `components/book-caption.tsx` são
**reusados sem alteração**.

## Interface

A página repete a estrutura de `app/(main)/favoritos/page.tsx`: título, uma linha de
contagem, e a `Estante`. Acima da grade, duas abas ("Lidos" e "Abandonados"), a ativa
destacada com as mesmas classes de item ativo que `nav-bar.tsx` usa
(`bg-accent text-accent-foreground`), para não inventar um terceiro estilo de seleção.

Estados vazios, por `EmptyState`, com texto próprio de cada aba:
- Lidos: explica que marcar um livro como lido na página dele o traz para cá.
- Abandonados: diz que nenhum livro foi abandonado — o que é uma boa notícia, não um erro.

## Tratamento de erros

Não há novos caminhos de erro: a página só lê, por `withUser` (RLS), como as demais
estantes. O único valor de entrada é `aba`, tratado por default em vez de erro (AD-1).

## Testes

- **`fetchLidos`:** traz só `read_status = 'lido'`; ordena por `date_finished` desc; livro
  sem data vem depois dos que têm data; empate de data ou ausência dela desempata por
  título.
- **`fetchAbandonados`:** traz só `read_status = 'abandonado'`; ordena por título.
- **Isolamento entre usuários:** um lido de outro usuário não aparece — as consultas passam
  por `withUser`, e o padrão já está em `test/db/rls.test.ts`.
- **Interface:** sem framework de teste de componente no repo (convenção registrada nas
  specs de 2026-08-14); verificação por typecheck, lint e uso real no navegador
  redimensionado, cobrindo: as duas abas carregam, a ativa fica destacada, `?aba=lixo` cai
  em Lidos, e "Leituras" aparece **tanto** no menu "Mais" do celular **quanto** na fileira
  do desktop (a prova do AD-3).
- CI (typecheck + lint + testes) permanece gate bloqueante.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Mover `HREFS_BARRA` criar import circular entre `nav-bar` e `mobile-tab-bar` | A constante passa a morar em `nav-bar.tsx`, ao lado de `LINKS`, e os dois componentes de celular a importam de lá — a seta aponta sempre na mesma direção |
| Menu "Mais" derivado crescer demais se `LINKS` crescer | O painel já rola; e a barra fixa continua com cinco lugares fixos, então o crescimento é visível no lugar certo |
| Ordenação por data confundir, com 17 de 27 lidos sem data | Nulos por último e desempate por título mantêm a lista previsível; a linha "N lidos sem data registrada" que o painel já exibe explica a origem |
