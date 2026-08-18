# Navegação mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a fileira de pills que rola escondida no celular por uma barra fixa de navegação no rodapé, simplificar o cabeçalho mobile, e ajustar painel de estatísticas e grade de capas para o celular — conforme `docs/superpowers/specs/2026-08-17-navegacao-mobile-design.md`.

**Architecture:** Dois componentes novos (`MobileMoreMenu`, `MobileTabBar`), ambos `'use client'`, sem novo estado de servidor nem rota. `NavBar` exporta seu array `LINKS` para reuso, e esconde a fileira de links/tema/sair a partir do celular (`hidden md:flex`) — a barra fixa nova assume a navegação abaixo de `md`. `Dashboard` e a grade de capas (`BooksGrid`, `app/loading.tsx`) ganham variantes de layout só no celular via classes responsivas do Tailwind.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS, lucide-react (ícones), sem framework de teste de componente.

## Global Constraints

- Breakpoint mobile/desktop é `md` (768px, padrão do Tailwind) — o mesmo já usado em toda a base (`hidden md:block`, etc.).
- **Sem framework de teste de componente neste repo.** A verificação de cada tarefa é `pnpm typecheck`, `pnpm lint`, e checagem manual no navegador redimensionado (375×812, ou o preset "mobile" da ferramenta de preview) — mesmo padrão das specs anteriores do projeto.
- Altura da barra fixa é `h-14` (56px). Onde outro elemento precisa ficar rente a ela (a barra de seleção de livros), usa `bottom-14`. Onde só precisa de espaço para não ficar escondido atrás dela (o conteúdo rolável da página), usa `pb-16` (64px, valor da spec) — 8px de folga acima da barra.
- Nomes de variável, comentários e mensagens de commit em português, extensão `type:` minúscula (`feat:`), no estilo do `git log` já existente no repo.
- Componentes novos seguem o padrão de gatilho + painel que `components/mobile-filters.tsx` já usa (estado local `aberto`, trava `document.body.style.overflow` enquanto aberto, fecha com `Escape`, `role="dialog"` + `aria-modal`).

---

### Task 1: Componente `MobileMoreMenu`

**Files:**
- Create: `components/mobile-more-menu.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` de `components/theme-toggle.tsx` (`export function ThemeToggle()`, sem props); `createClient` de `@/lib/supabase/client`.
- Produces: `export function MobileMoreMenu()` — componente sem props, usado pela `Task 2`.

- [ ] **Step 1: Criar o componente**

Criar `components/mobile-more-menu.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  HeartIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  XIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ThemeToggle } from './theme-toggle';

/**
 * Itens que não cabem na barra fixa do celular (mobile-tab-bar.tsx):
 * Favoritos, Configurações, o alternador de tema e Sair. Mesmo padrão de
 * gatilho + painel que mobile-filters.tsx já usa, com o painel entrando
 * pela lateral (mesma estrutura, evita inventar um segundo padrão de
 * painel no app).
 */
export function MobileMoreMenu() {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', aoTecla);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', aoTecla);
    };
  }, [aberto]);

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground"
      >
        <MoreHorizontalIcon className="h-5 w-5" aria-hidden />
        <span className="text-[11px] font-medium">Mais</span>
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Mais opções"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setAberto(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col bg-card text-card-foreground shadow-xl ring-1 ring-border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Mais
              </h2>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Fechar"
              >
                <XIcon className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="flex flex-col gap-1 p-3">
              <Link
                href="/favoritos"
                onClick={() => setAberto(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
              >
                <HeartIcon className="h-4 w-4" aria-hidden />
                Favoritos
              </Link>
              <Link
                href="/settings"
                onClick={() => setAberto(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
              >
                <SettingsIcon className="h-4 w-4" aria-hidden />
                Configurações
              </Link>
              <div className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-foreground">
                Tema
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={sair}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOutIcon className="h-4 w-4" aria-hidden />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: sem erros (o componente ainda não é usado em lugar nenhum, mas precisa compilar sozinho).

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add components/mobile-more-menu.tsx
git commit -m "feat: painel Mais para navegacao mobile (favoritos, configuracoes, tema, sair)"
```

---

### Task 2: Componente `MobileTabBar`

**Files:**
- Modify: `components/nav-bar.tsx` (só adiciona `export` ao `const LINKS` existente — nenhuma outra mudança nesta tarefa)
- Create: `components/mobile-tab-bar.tsx`

**Interfaces:**
- Consumes: `LINKS` de `components/nav-bar.tsx` (após este passo, `export const LINKS: { href: string; label: string; ativo: (path: string) => boolean }[]`); `MobileMoreMenu` da `Task 1`; `cn` de `@/lib/utils`.
- Produces: `export default function MobileTabBar()` — usado pela `Task 3` em `app/(main)/layout.tsx`.

- [ ] **Step 1: Exportar `LINKS` em `nav-bar.tsx`**

Em `components/nav-bar.tsx:10`, mudar:

```ts
const LINKS = [
```

para:

```ts
export const LINKS = [
```

(nenhuma outra linha muda nesta tarefa — o resto de `nav-bar.tsx` é ajustado na Task 3).

- [ ] **Step 2: Criar o componente `MobileTabBar`**

Criar `components/mobile-tab-bar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookmarkIcon,
  LayersIcon,
  LibraryIcon,
  ShoppingBagIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LINKS } from './nav-bar';
import { MobileMoreMenu } from './mobile-more-menu';

const ICONES: Record<string, typeof LibraryIcon> = {
  '/': LibraryIcon,
  '/desejados': ShoppingBagIcon,
  '/proximos': BookmarkIcon,
  '/bibliotecas': LayersIcon,
};

// Ordem decidida com o dono: Acervo, Quero ter, Próximos, Bibliotecas.
// Favoritos/Configurações/Sair ficam no menu "Mais" (mobile-more-menu.tsx).
const HREFS_BARRA = ['/', '/desejados', '/proximos', '/bibliotecas'];

export default function MobileTabBar() {
  const pathname = usePathname();
  const itens = LINKS.filter((link) => HREFS_BARRA.includes(link.href)).sort(
    (a, b) => HREFS_BARRA.indexOf(a.href) - HREFS_BARRA.indexOf(b.href)
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t bg-card md:hidden">
      {itens.map((item) => {
        const ativo = item.ativo(pathname);
        const Icone = ICONES[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5',
              ativo ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icone className="h-5 w-5" aria-hidden />
            <span className="text-[11px] font-medium">{item.label}</span>
          </Link>
        );
      })}
      <MobileMoreMenu />
    </nav>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: sem erros. (`MobileTabBar` ainda não é renderizado em lugar nenhum — Task 3 faz isso — então este passo só confirma que o componente compila e os tipos batem com `LINKS`.)

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add components/nav-bar.tsx components/mobile-tab-bar.tsx
git commit -m "feat: barra fixa de navegacao para o celular"
```

---

### Task 3: Simplificar `NavBar` no celular e integrar a barra fixa no layout

**Files:**
- Modify: `components/nav-bar.tsx`
- Modify: `app/(main)/layout.tsx`

**Interfaces:**
- Consumes: `MobileTabBar` (default export) da `Task 2`.
- Produces: nada consumido por tarefas seguintes — esta tarefa fecha a navegação mobile.

- [ ] **Step 1: Esconder a fileira de links/tema/sair abaixo de `md` em `nav-bar.tsx`**

Substituir o corpo de `components/nav-bar.tsx` (a função `NavBar`, do `return` em diante) por:

```tsx
  return (
    <nav className="flex items-center gap-1.5 py-2">
      <Link
        href="/"
        className="mr-auto flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <BookMarkedIcon className="h-4 w-4" aria-hidden />
        </span>
        <span className="hidden sm:inline">Book Inventory</span>
      </Link>
      {/* No celular a navegação vive na barra fixa do rodapé
          (mobile-tab-bar.tsx) + no menu "Mais" (mobile-more-menu.tsx) —
          esta fileira só aparece a partir do md. */}
      <div className="no-scrollbar hidden items-center gap-1.5 overflow-x-auto md:flex">
        {LINKS.map((link) => {
          const ativo = link.ativo(pathname);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                ativo
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              {link.label}
            </Link>
          );
        })}
        <ThemeToggle />
        <button
          onClick={sair}
          className="ml-1 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOutIcon className="h-4 w-4" aria-hidden />
          Sair
        </button>
      </div>
    </nav>
  );
}
```

(A única mudança real é envolver `{LINKS.map(...)}` + `<ThemeToggle />` + o botão "Sair" num `<div className="no-scrollbar hidden items-center gap-1.5 overflow-x-auto md:flex">`, movendo as classes `no-scrollbar overflow-x-auto` do `<nav>` pra esse `<div>`. O `<nav>` em si perde `no-scrollbar overflow-x-auto` — sobra só `flex items-center gap-1.5 py-2`. O link do logo continua fora do `div`, sempre visível.)

- [ ] **Step 2: Adicionar `MobileTabBar` e reservar espaço no conteúdo em `layout.tsx`**

Em `app/(main)/layout.tsx`, adicionar o import:

```ts
import MobileTabBar from '@/components/mobile-tab-bar';
```

Mudar a última parte do JSX (a partir do `<div className="flex-1 flex flex-col p-4">{children}</div>`):

```tsx
        <div className="flex-1 flex flex-col p-4 pb-16 md:pb-4">{children}</div>
      </div>
      <Suspense fallback={null}>
        <MobileTabBar />
      </Suspense>
    </div>
  );
}
```

(`pb-16` no celular reserva espaço pro conteúdo — principalmente a paginação, que hoje termina o fluxo normal da página — não ficar colado/escondido atrás da barra fixa de 56px; `md:pb-4` volta ao padding original no desktop, onde não há barra fixa.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: sem erros.

- [ ] **Step 5: Verificação manual no navegador**

Com o dev server rodando (`pnpm dev`), redimensionar para 375×812 (ou usar o preset "mobile" da ferramenta de preview) e conferir na Home (`/`):
- A fileira de pills antiga sumiu; aparece a barra fixa no rodapé com Acervo, Quero ter, Próximos, Bibliotecas, Mais.
- O item correspondente à página atual fica destacado (`text-primary`).
- Tocar em "Mais" abre o painel lateral com Favoritos, Configurações, alternador de tema e Sair; `Escape` ou tocar fora fecha.
- O logo continua visível no topo; a busca e o botão "Filtros" continuam funcionando.
- Redimensionar de volta pra desktop (≥768px): a fileira de pills antiga volta a aparecer, a barra fixa do rodapé some.

- [ ] **Step 6: Commit**

```bash
git add components/nav-bar.tsx "app/(main)/layout.tsx"
git commit -m "feat: navegacao mobile na barra fixa, cabecalho so com logo/busca/filtros"
```

---

### Task 4: Faixa horizontal do painel de estatísticas no celular

**Files:**
- Modify: `components/dashboard.tsx`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada consumido por outras tarefas — independente das Tasks 1-3 e 5.

- [ ] **Step 1: Trocar a grade dos 5 cartões por uma faixa rolável no celular**

Em `components/dashboard.tsx:53`, mudar:

```tsx
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="flex flex-col items-center rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border"
          >
```

para:

```tsx
      <div className="flex gap-4 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 lg:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="flex min-w-24 shrink-0 flex-col items-center rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border md:min-w-0"
          >
```

(Abaixo de `md`: `flex overflow-x-auto` com cada cartão em `min-w-24 shrink-0` — mesmo espírito do `w-24 shrink-0` que `components/reading-strip.tsx` já usa pro carrossel "Lendo agora". A partir de `md`: volta a ser a grade 2×3/3×5 de antes, com `md:min-w-0` desfazendo a largura mínima fixa.

Nota pós-revisão: a implementação original usava `min-w-[104px]`; a revisão de branch inteira apontou que esse valor deixava o 4º cartão praticamente fora da tela em telas de 375–412px, sem nenhuma pista de que dava pra arrastar — exatamente o problema que esta spec existe pra evitar. Corrigido para `min-w-24` (96px, igual ao `reading-strip.tsx`), que deixa uma "espiada" visível do próximo cartão.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Verificação manual no navegador**

Em 375×812, na Home: os 5 cartões (Total, Lendo, Lidos, Abandonados, Páginas) ficam numa linha só, arrastável na horizontal, sem quebrar em 2 colunas. Em ≥768px: volta à grade de antes (2/3/5 colunas conforme a largura).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard.tsx
git commit -m "perf: painel de estatisticas em faixa horizontal no celular"
```

---

### Task 5: Grade em 2 colunas no celular e barra de seleção acima da navegação fixa

**Files:**
- Modify: `components/grid.tsx`
- Modify: `app/loading.tsx`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada consumido por outras tarefas.

- [ ] **Step 1: Grade de capas em 2 colunas no celular, em `grid.tsx`**

Em `components/grid.tsx:162`, mudar:

```tsx
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
```

para:

```tsx
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
```

- [ ] **Step 2: Barra de seleção não fica atrás da navegação fixa, em `grid.tsx`**

Em `components/grid.tsx:246`, mudar:

```tsx
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card p-3 shadow-lg">
```

para:

```tsx
        <div className="fixed inset-x-0 bottom-14 z-20 border-t bg-card p-3 shadow-lg md:bottom-0">
```

(`bottom-14` = 56px, a mesma altura de `mobile-tab-bar.tsx` — a barra de seleção fica rente acima dela no celular. No desktop, `md:bottom-0`, porque lá não existe barra fixa de navegação.)

- [ ] **Step 3: Esqueleto de carregamento acompanha as 2 colunas, em `app/loading.tsx`**

Em `app/loading.tsx:7`, mudar:

```tsx
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 p-4">
```

para:

```tsx
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 p-4">
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: sem erros.

- [ ] **Step 6: Verificação manual no navegador**

Em 375×812, na Home:
- A grade de capas mostra 2 colunas (capas maiores que antes).
- Tocar "Selecionar", marcar 1-2 livros: a barra "N selecionado(s) / Ler em seguida / ..." aparece rente **acima** da barra fixa de navegação, não sobreposta nem escondida atrás dela.
- Recarregar a página (ou navegar rápido o bastante pra ver o esqueleto): o esqueleto de carregamento também mostra 2 colunas, sem "pular" de layout quando o conteúdo real chega.

- [ ] **Step 7: Commit**

```bash
git add components/grid.tsx app/loading.tsx
git commit -m "feat: grade de capas em 2 colunas no celular, barra de selecao acima da navegacao fixa"
```

---

### Task 6: Verificação final de ponta a ponta

**Files:** nenhum (só verificação — nenhuma mudança de código).

**Interfaces:** N/A.

- [ ] **Step 1: Rodar a suíte completa**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: tudo passa (esta spec não muda lógica de dados/servidor, então os testes existentes de `lib/db` etc. devem continuar verdes sem qualquer alteração).

- [ ] **Step 2: Percorrer as páginas principais no celular (375×812)**

Com `pnpm dev` rodando, conferir em cada uma:
- **Home (`/`)**: barra fixa, painel em faixa horizontal, grade em 2 colunas, paginação alcançável rolando até o fim (não escondida atrás da barra).
- **Página de um livro (`/[id]`)**: a barra fixa aparece (é parte do layout, não só da Home); o logo/busca/filtros continuam no topo.
- **Bibliotecas, Próximos, Favoritos, Quero ter, Configurações**: cada rota destaca o ícone certo na barra fixa quando é a página atual.
- **Menu "Mais"**: abre, lista Favoritos/Configurações/tema/Sair, fecha com `Escape`/toque fora/botão X; "Sair" desloga de verdade.

- [ ] **Step 3: Conferir que o desktop não mudou**

Redimensionar para ≥1280px de largura: sidebar de filtros, fileira de pills no topo, painel de estatísticas em grade e grade de capas em várias colunas — tudo como estava antes desta spec. A barra fixa do celular não aparece.

- [ ] **Step 4: Commit final (se algo precisou de ajuste nesta verificação)**

Se a verificação não pedir nenhuma mudança, não há o que commitar nesta tarefa — ela existe pra travar a qualidade antes de considerar a spec pronta, não pra gerar um commit.
