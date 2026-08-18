# Book Inventory — Spec: Navegação e leitura de estante no celular

**Data:** 2026-08-17
**Status:** Aprovado para planejamento
**Sucede:** o redesenho visual (tema creme/âmbar) e as otimizações de navegação instantânea

## Contexto

O redesenho visual (2026-08-16) deixou o app tecnicamente utilizável no celular, mas a
navegação principal (`components/nav-bar.tsx`) é uma fileira de pills que rola na horizontal
sem nenhuma pista visual — sem barra, seta ou degradê indicando que há mais itens fora da tela.
Testando no Firefox (modo responsivo), o dono descreveu a sensação como "página cortada ao
meio": o menu completo (Favoritos, Quero ter, Configurações, Sair) e o restante do painel de
estatísticas ficam fora da tela sem nenhum indício de que dá para arrastar.

O dono confirmou que arrastar funciona — o problema é de percepção/affordance, não de bug. Mas
ele quer mais que um remendo: a navegação mobile precisa "ficar realmente legal", inclusive
pensando à frente no próximo ciclo grande (leitor de livro pelo celular, ver
`docs/superpowers/specs/` futuro — ainda não iniciado, depende do acesso do servidor aos
arquivos do Calibre/Drive). Decisões de layout aqui devem deixar o topo da tela livre, já que
uma tela de leitura vai precisar desse espaço.

Três decisões foram validadas com o dono usando mockups (ver
`.superpowers/brainstorm/667-1787017197/content/`):

- **Navegação**: barra fixa no rodapé (padrão de app nativo), não a fileira de pills com
  degradê nem um menu hambúrguer.
- **Painel de estatísticas**: faixa horizontal rolável (mesmo padrão do carrossel "Lendo
  agora"), não a grade 2×3 atual nem um resumo de uma linha.
- **Grade de capas**: 2 colunas no celular (hoje são 3).

## Objetivo

A navegação e a leitura da estante no celular parecerem desenhadas para o celular, não uma
adaptação do layout de desktop.

**Critério de sucesso:** no celular, as quatro seções mais usadas (Acervo, Quero ter, Próximos,
Bibliotecas) e o menu "Mais" ficam sempre visíveis e alcançáveis com o polegar, sem exigir
rolagem horizontal para navegar. O topo da tela concentra só busca e filtros.

## Não-objetivos

- Leitor de livro pelo celular — ciclo separado, que depende do acesso do servidor aos arquivos
  (ver memória `calibre-library-on-google-drive`). Esta spec só prepara o terreno (topo livre).
- Mudar a navegação de desktop — a sidebar fixa (`hidden md:block w-[300px]`) e o header
  continuam como estão acima do breakpoint `md` (768px).
- App nativo / PWA instalável, service worker, notificações — fora de escopo.
- Reordenar ou renomear as seções (Bibliotecas, Próximos, etc.) — só muda onde/como aparecem no
  celular.

## Decisões de arquitetura

### AD-1 — Barra fixa no rodapé substitui a fileira de pills no celular

**Decisão:** abaixo do breakpoint `md`, `components/nav-bar.tsx` para de renderizar a fileira
horizontal de links. Um novo componente `components/mobile-tab-bar.tsx` (`'use client'`, fixo
via `fixed inset-x-0 bottom-0`) mostra 5 ícones: **Acervo, Quero ter, Próximos, Bibliotecas,
Mais** — nessa ordem, decidida com o dono. O item ativo usa `usePathname()` para destacar (mesmo
padrão que `nav-bar.tsx` já usa com `ativo(path)`).

**Motivo:** é o padrão que mais "parece nativo" no celular (mockup A, aprovado), mantém as
seções mais usadas a um toque do polegar, e libera o topo da tela — relevante para o leitor
futuro.

**"Mais" é um botão, não uma 5ª rota.** Abre um painel (reaproveita o padrão
`fixed inset-0` + drawer lateral que `components/mobile-filters.tsx` já usa, mas com a lista de
seções restantes) com **Favoritos, Configurações, o alternador de tema (`ThemeToggle`) e Sair**.
Não é uma página nova — é o mesmo menu que sumiu da fileira de pills, só que atrás de um toque a
mais. O `ThemeToggle` entra aqui porque hoje ele mora dentro do `NavBar` (que vira
`hidden md:flex` no AD-2) — sem essa realocação, o alternador de tema sumiria do celular.

### AD-2 — Header do celular perde a navegação, mantém logo, busca e filtros

**Decisão:** `components/nav-bar.tsx` hoje é um único `<nav>` com quatro partes: link do logo,
`{LINKS.map(...)}`, `ThemeToggle` e o botão "Sair". Só a parte do meio
(`{LINKS.map(...)}` + `ThemeToggle` + "Sair") ganha `hidden md:flex` — o link do logo continua
sempre visível, em qualquer largura. No celular, o cabeçalho sticky fica então com: logo, busca
(`Search`) e o botão "Filtros" (`MobileFilters`) — o que já está lá, só sem a fileira de links
nem o botão de Sair (que vai para "Mais", AD-1).

**Motivo:** consequência direta do AD-1 — navegação duplicada ocuparia espaço à toa (em cima E
embaixo). O logo continua visível para orientação ("onde estou/qual app é esse"), sem competir
com a barra do rodapé.

### AD-3 — Painel de estatísticas vira faixa horizontal no celular

**Decisão:** `components/dashboard.tsx` recebe uma variante mobile: abaixo de `md`, os 5
cartões (`grid grid-cols-2`) passam a um contêiner `flex gap-4 overflow-x-auto` com cada cartão
em largura fixa (`min-w-24 shrink-0` — 96px, no espírito do `w-24 shrink-0` que
`components/reading-strip.tsx` já usa). Acima de `md`, a grade 2×3/3×5 atual continua igual —
só o celular muda.

**Nota pós-revisão:** a implementação passou primeiro por `min-w-[104px]`; a revisão de branch
inteira mostrou que esse valor deixava o 4º cartão sem nenhuma "espiada" visível em telas de
375–412px — o mesmo problema de affordance que esta spec existe pra resolver. Ajustado para
`min-w-24` (96px), igual ao `reading-strip.tsx`.

**Motivo:** mockup B, aprovado — mantém todos os números visíveis sem exigir toque extra
(diferente do resumo de uma linha, descartado), mas devolve a tela para a grade de livros bem
mais cedo que a grade 2×3 atual. Reaproveita um padrão de carrossel que o app já tem, em vez de
inventar um novo.

### AD-4 — Grade de capas vai para 2 colunas no celular

**Decisão:** `components/grid.tsx`, a classe `grid grid-cols-3 gap-4 sm:grid-cols-4 ...` perde o
`grid-cols-3` de base e passa a `grid-cols-2` abaixo de `sm` (o restante da progressão —
`sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7` — não muda). `app/loading.tsx`
usa a mesma classe de grade e recebe o mesmo ajuste, para o esqueleto de carregamento continuar
batendo com a grade real.

**Motivo:** decisão do dono nos mockups — capas maiores e título mais legível valem mais que
caber mais livros por tela.

### AD-5 — Elementos que já são fixos no rodapé passam a considerar a barra de navegação

**Decisão:** dois pontos do app já usam posicionamento fixo/final na tela e colidiriam com a
nova barra:

- **Barra de seleção** (`components/grid.tsx`, `fixed inset-x-0 bottom-0` quando `selecionando`
  é true): no celular, ganha `bottom-14` (ou o equivalente à altura da `mobile-tab-bar`, definida
  como constante compartilhada) em vez de `bottom-0`, para não cobrir nem ser coberta pela barra
  de navegação.
- **Paginação** (`app/(main)/page.tsx`, `<div className="mt-auto p-4 border-t">`): não é fixa,
  mas fica ao final do conteúdo rolável. O contêiner de página (`layout.tsx`,
  `.flex-1.flex.flex-col.p-4`) ganha `pb-16 md:pb-4` no celular, para a paginação não ficar
  colada/escondida atrás da barra fixa.

**Motivo:** sem isso, a barra de seleção (que já existe, usada ao adicionar vários livros a uma
biblioteca ou à fila) ficaria por baixo da nova navegação, inutilizável no celular.

## Componentes e arquivos afetados

| Arquivo | Mudança |
|---|---|
| `components/mobile-tab-bar.tsx` | **Novo.** Barra fixa com 5 itens (AD-1). |
| `components/mobile-more-menu.tsx` | **Novo.** Painel "Mais" (Favoritos/Configurações/`ThemeToggle`/Sair), reaproveitando o padrão de `mobile-filters.tsx`. |
| `components/nav-bar.tsx` | Fileira de links + `ThemeToggle` + "Sair" passam a `hidden md:flex`; o link do logo continua sempre visível (AD-2). |
| `app/(main)/layout.tsx` | Inclui `<MobileTabBar />` fora do header sticky; ajusta padding do conteúdo (AD-5). |
| `components/dashboard.tsx` | Variante `flex overflow-x-auto` abaixo de `md` (AD-3). |
| `components/grid.tsx` | `grid-cols-2` de base na grade; barra de seleção com `bottom-14` no celular (AD-4, AD-5). |
| `app/loading.tsx` | Esqueleto acompanha `grid-cols-2` (AD-4). |
| `app/(main)/page.tsx` | Padding inferior do conteúdo pro AD-5. |

Nenhuma mudança de schema, rota de API ou lógica de dados — é inteiramente CSS/estrutura de
componente client-side, com breakpoint `md` (768px) como já usado em todo o app.

## Tratamento de erros

Não há novos caminhos de erro — são componentes de apresentação sem I/O. O único cuidado é de
acessibilidade: o painel "Mais" segue o mesmo contrato que `mobile-filters.tsx` já implementa
(`role="dialog"`, `aria-modal`, fecha com `Escape`, trava o scroll do body enquanto aberto).

## Testes

Sem framework de teste de componente no repo (mesmo padrão das specs anteriores) — a
verificação é typecheck + uso real no navegador redimensionado (`resize_window` mobile) cobrindo:
menu "Mais" abre/fecha, item ativo destaca ao navegar, seleção múltipla de livros não fica
escondida atrás da barra, paginação alcançável por rolagem, grade em 2 colunas abaixo de `sm`.
CI (typecheck + lint) permanece gate bloqueante.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Barra fixa reduz espaço vertical útil em telas pequenas | Altura contida (~56px), e o painel de estatísticas em faixa horizontal (AD-3) já devolve espaço equivalente |
| "Mais" esconder Favoritos atrás de um toque extra pode incomodar quem usa Favoritos com frequência | Decisão explícita do dono nos mockups; fácil de promover Favoritos pra barra fixa depois se o uso mostrar necessidade |
| Duplicar padding-bottom/offset em vários componentes (AD-5) pode desalinhar se a altura da barra mudar | Definir a altura da barra como uma constante única (ex.: `--mobile-nav-h` ou classe compartilhada) referenciada nos três pontos, não valores soltos |
