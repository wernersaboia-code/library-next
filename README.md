# Book Inventory

Catálogo pessoal de livros. O acervo é importado do [Calibre](https://calibre-ebook.com/)
e fica acessível pelo navegador — a ideia é consultar e atualizar a estante do
celular, sem sentar no computador onde o Calibre roda.

Não é um leitor: os arquivos dos livros continuam no Calibre e nos aparelhos de
leitura. O que vive aqui é o catálogo e o registro da leitura.

## Funcionalidades

**Catálogo**

- Grade de capas com _placeholder_ progressivo (ThumbHash)
- Busca full-text em português, com _debounce_
- Filtros por ano, avaliação, idioma, páginas, status de leitura, série e posse
- Salto direto para qualquer página do acervo
- Séries agrupadas por nome, com o número do volume à parte
- Título original em língua original (ex.: "Dune" para "Duna"), editável em qualquer livro

**Leitura**

- Status: lido, lendo, não lido e abandonado — este último com o motivo registrado
- Progresso por percentual ou por página, com conversão entre os dois
- Avaliação de 0,5 a 5 estrelas, de meia em meia
- Datas de início e de conclusão, separando "terminei hoje" de catalogação retroativa
- Faixa "Lendo agora" no topo do acervo
- Notas e citações por livro
- Painel com totais, páginas lidas e contagem por mês e por ano

**Estantes**

- **Bibliotecas** — coleções temáticas que você cria e nomeia
- **Próximos** — a fila: o que ler antes dos outros
- **Favoritos** — os lidos que superaram as expectativas
- **Quero ter** — livros que ainda não estão no acervo
- Modo de seleção para marcar vários livros de uma vez

**Outros**

- Cadastro manual de livros, com busca de metadados na Open Library
- Modo escuro acompanhando o tema do sistema
- Isolamento por usuário no banco, via Row Level Security

## Stack

- **Frontend:** Next.js 15 (App Router, Server Components), React 19, Tailwind CSS, shadcn/ui
- **Backend:** Next.js Route Handlers + Server Components
- **Banco:** PostgreSQL (Supabase) + Drizzle ORM, com RLS por usuário
- **Autenticação e capas:** Supabase Auth e Supabase Storage
- **Origem do acervo:** biblioteca do Calibre (`metadata.db`), lida por `sql.js`
- **Testes:** Vitest
- **Deploy:** Vercel

## Como rodar

```bash
pnpm install
cp .env.example .env   # preencha as variáveis
pnpm db:migrate        # cria a estrutura do banco
pnpm dev
```

Para trazer os livros do Calibre:

```bash
pnpm db:import-calibre --email=voce@exemplo.com --path="/caminho/da/biblioteca"
```

O `--path` aponta para a pasta que contém o `metadata.db`. Alternativamente,
defina `CALIBRE_PATH` no `.env`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm test:run` | Suíte de testes |
| `pnpm typecheck` | Verificação de tipos |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` | Aplica migrations — **estrutura** do banco |
| `pnpm db:import-calibre` | Importa **livros** do Calibre |
| `pnpm db:generate` | Gera migration a partir do schema |
| `pnpm db:studio` | Drizzle Studio |

`db:migrate` e `db:import-calibre` fazem coisas diferentes e são fáceis de
confundir: o primeiro mexe na estrutura (raro), o segundo traz os livros (a cada
mudança na biblioteca). Quando os dois forem necessários, a migração vem
primeiro. Ver [docs/atualizar-acervo.md](docs/atualizar-acervo.md).

## O que a importação nunca sobrescreve

O Calibre manda apenas catálogo — título, autores, série, editora, ano, idioma,
páginas, sinopse, gênero e capa. Status de leitura, avaliação, datas, progresso,
motivo de abandono, coleções e as marcas de próximo e favorito são dados seus e
ficam intocados a cada importação. A garantia é estrutural: o tipo
`CatalogMetadata` em `lib/db/calibre-sync.ts` faz o compilador recusar qualquer
campo fora da lista de catálogo.

## Documentação

Specs e planos de implementação ficam em `docs/superpowers/`. Cada mudança
relevante tem uma spec com as decisões de arquitetura e o porquê delas — é o
melhor lugar para entender por que algo foi feito de um jeito e não de outro.

A RLS por usuário está documentada em [docs/ativar-rls.md](docs/ativar-rls.md):
o banco já tem as policies; o documento cobre o passo a passo para a aplicação
passar a conectar como `book_app` (em vez de `postgres`, que as ignora).
