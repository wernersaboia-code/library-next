# Book Inventory

Catálogo pessoal de livros com leitor EPUB/PDF no navegador e no celular.
O acervo pode vir do [Calibre](https://calibre-ebook.com/) ou de arquivos escolhidos
no aparelho. Reúne a estante, os arquivos de leitura, notas e acompanhamento,
com acesso offline aos livros baixados pelo aplicativo.

## Funcionalidades

**Catálogo**

- Grade de capas com _placeholder_ progressivo (ThumbHash)
- Busca full-text em português, com _debounce_
- Filtros por ano, avaliação, idioma, páginas, status de leitura, série e posse
- Salto direto para qualquer página do acervo
- Ao voltar de uma ficha, recuperação do livro e da posição na tela, conservando página e filtros
- Estantes dinâmicas: salve buscas com nome; os resultados acompanham as mudanças do acervo
- Séries agrupadas por nome, com o número do volume à parte
- Páginas de autores e séries, com busca por nome, contagem de livros e paginação; séries em ordem de volume
- Título original em língua original (ex.: "Dune" para "Duna"), editável em qualquer livro

**Leitura**

- Status: lido, lendo, não lido e abandonado — este último com o motivo registrado
- Progresso por percentual ou por página, com conversão entre os dois
- Avaliação de 0,5 a 5 estrelas, de meia em meia
- Datas de início e de conclusão, separando "terminei hoje" de catalogação retroativa
- Faixa "Lendo agora" no topo do acervo
- Notas e citações por livro
- Painel com totais, páginas lidas e contagem por mês e por ano
- Leitura em página (EPUB/PDF), com tradução de trechos e destaques
- Exportação de histórico, avaliações, progresso e anotações em CSV e Markdown, em Configurações

**Estantes**

- **Bibliotecas** — coleções temáticas que você cria e nomeia
- **Próximos** — a fila: o que ler antes dos outros
- **Favoritos** — os lidos que superaram as expectativas
- **Quero ter** — livros que ainda não estão no acervo
- Modo de seleção para marcar vários livros de uma vez

**Outros**

- Cadastro a partir de EPUB/PDF, com extração local de dados, capa de EPUB e revisão antes de salvar
- Avisos de duplicados por SHA-256, ISBN e título/autor; opção de reutilizar um cadastro sem arquivo
- Metadados da Open Library, Google Books e Wikidata, com revisão de conflitos e fontes por campo
- Catálogo **OPDS** para apps de leitura (KOReader, Thorium, Calibre)
- Modo escuro acompanhando o tema do sistema
- Policies de Row Level Security por usuário (a ativação depende do papel da conexão; veja `docs/ativar-rls.md`)

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
pnpm db:setup-storage  # cria os buckets covers/book-files no Storage
pnpm dev
```

Para trazer os livros do Calibre (catálogo):

```bash
pnpm db:import-calibre --email=wernersaboia@gmail.com --path="/caminho/da/biblioteca"
```

Para subir os **arquivos** de leitura (EPUB/PDF) dos livros que você marcou com
"Preparar para leitura" no app:

```bash
pnpm db:sync-files -- --email=wernersaboia@gmail.com --path="D:\Caminho\Calibre Library"
```

O `--path` aponta para a pasta que contém o `metadata.db`. Alternativamente,
defina `CALIBRE_PATH` no `.env` e o `--path` fica opcional. Sem argumento
nenhum, o `sync-files` usa o `CALIBRE_PATH` ou o caminho padrão
`C:\Livros\Calibre Portable\Calibre Library`.

Neste projeto o `.env` já define `OWNER_EMAIL`, então o dia a dia é só:

```bash
pnpm db:sync-files
# ou, se a biblioteca não estiver no CALIBRE_PATH/padrão:
pnpm db:sync-files -- --path="D:\Caminho\Calibre Library"
```

> O `--` antes de `--email`/`--path` é necessário para o pnpm repassar os
> argumentos ao script.

## OPDS

O catálogo é publicado em `/opds` no formato OPDS 1.2 (Atom), para apps de
leitura navegarem e baixarem os arquivos direto no aparelho (KOReader, Thorium,
Calibre). A autenticação é HTTP Basic: **usuário** é o seu e-mail (o mesmo do
`OWNER_EMAIL`) e **senha** é o `OPDS_PASSWORD` configurado no ambiente. Ambos são
obrigatórios; sem eles, o endpoint responde 503. Outros e-mails não são aceitos.
As consultas filtram o proprietário e as requisições têm limite local por IP.

No app de leitura, aponte para `https://<seu-app>/opds` e ele descobre o
resto. De lá dá para navegar pelo **Acervo** (`/opds/acervo`), por **Lendo
agora**, **Próximos**, **Favoritos** e por cada **Biblioteca**
(`/opds/bibliotecas`), além de **buscar por título ou autor** (OpenSearch).
Só livros com o arquivo já enviado (`has_file`) ganham link de download; os
demais aparecem no feed, mas sem o arquivo.

## Importar pelo aparelho

Abra **Importar livro** na barra lateral; no celular, a opção fica no menu **Mais**.
Escolha um EPUB ou PDF e confira os dados extraídos. A leitura dos metadados e o
cálculo do hash acontecem no aparelho. PDFs fornecem título, autor e número real
de páginas quando disponíveis; o ano de criação do PDF não é tratado como ano
de publicação. EPUBs também podem fornecer capa, ISBN, idioma, editora e sinopse.

A opção **Completar dados com fontes externas** consulta o texto informado e
permite comparar sugestões com os dados do arquivo. Os campos já preenchidos
são preservados inicialmente; valores divergentes mostram sua fonte e podem
ser escolhidos individualmente. A capa extraída do EPUB permanece neste fluxo.
Em **Quero ter**, os resultados externos também passam por revisão antes do cadastro.
As buscas usam cache em memória por cinco minutos e prazo total de 18 segundos
por fonte; instâncias diferentes da Vercel não compartilham esse cache.

Antes de cadastrar, o app procura duplicados no seu acervo. Você pode abrir um
livro existente, enviar o arquivo para um cadastro do acervo que ainda não tem
arquivo, ou confirmar outra edição. Um envio interrompido pode ser retomado
no mesmo cadastro enquanto a tela estiver aberta. Após recarregar, a nova
tentativa encontra o cadastro pendente pelo ISBN ou título/autor e permite
reutilizá-lo. Arquivos com senha ou formato inválido não são importados.

O upload usa o fluxo direto ao Supabase Storage já existente. Não é necessário
aplicar uma migration nova para estas alterações.

## Explorar autores e séries

Abra **Autores** ou **Séries** na barra lateral; no celular, ambas estão no menu
**Mais**. Os índices mostram apenas nomes associados aos livros do seu catálogo,
incluindo desejados, e permitem procurar por parte do nome sem exigir acentos.
Livros com vários autores aparecem na página de cada um, com todos os coautores.

As séries usam os nomes já registrados no catálogo: espaços nas extremidades
são ignorados, mas nomes diferentes não são unidos automaticamente. Os volumes
são ordenados pelo número, incluindo frações; livros sem número ficam ao final.
As listas têm 28 livros por página. Na ficha, os nomes dos autores e da série
levam às páginas correspondentes; o botão **Voltar** conserva a página de origem.

Detalhes e validação em [docs/navegacao-autores-series.md](docs/navegacao-autores-series.md).

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm test:run` | Suíte de testes |
| `pnpm typecheck` | Verificação de tipos |
| `pnpm test:browser` | Testes de componentes no Chromium, em desktop e celular |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` | Aplica migrations — **estrutura** do banco |
| `pnpm db:import-calibre` | Importa **livros** do Calibre |
| `pnpm db:sync-files` | Sobe os **arquivos** (EPUB/PDF) dos livros marcados no app |
| `pnpm db:setup-storage` | Cria os buckets `covers` e `book-files` (idempotente) |
| `pnpm db:normalize-covers` | Recomprime capas antigas em resolução cheia (dry-run) |
| `pnpm db:cleanup-storage` | Remove objetos órfãos do Storage (dry-run) |
| `pnpm db:generate` | Gera migration a partir do schema |
| `pnpm db:studio` | Drizzle Studio |

`db:migrate` e `db:import-calibre` fazem coisas diferentes e são fáceis de
confundir: o primeiro mexe na estrutura (raro), o segundo traz os livros (a cada
mudança na biblioteca). Quando os dois forem necessários, a migração vem
primeiro. Ver [docs/atualizar-acervo.md](docs/atualizar-acervo.md).

`db:normalize-covers` e `db:cleanup-storage` são **dry-run por padrão**: mostram
o que fariam sem tocar em nada. Para aplicar de verdade, acrescente `-- --apply`
(ex.: `pnpm db:cleanup-storage -- --apply`).

## O que a importação nunca sobrescreve

O Calibre manda apenas catálogo — título, autores, série, editora, ano, idioma,
páginas, sinopse, gênero e capa. Status de leitura, avaliação, datas, progresso,
motivo de abandono, coleções e as marcas de próximo e favorito são dados seus e
ficam intocados a cada importação. A garantia é estrutural: o tipo
`CatalogMetadata` em `lib/db/calibre-sync.ts` faz o compilador recusar qualquer
campo fora da lista de catálogo.

## Documentação

As ferramentas de CSS ficam em `devDependencies`; veja
[dependências de compilação e o alerta de braces](docs/dependencias-de-compilacao.md)
para a distinção entre auditoria de produção e o risco residual nas ferramentas.

As estantes dinâmicas requerem a migration `0019_saved_searches` (`pnpm db:migrate`).
São buscas da sua conta, disponíveis entre aparelhos; salvar não copia livros nem
altera as coleções manuais. A página não faz parte da busca salva.

Para os testes de navegador, execute `pnpm exec playwright install chromium` uma
vez e depois `pnpm test:browser`. O laboratório usa os componentes reais da grade,
estantes e exportação com dados sintéticos, navegação nativa e APIs simuladas,
sem acessar contas ou livros reais. Os testes verificam estabilidade das fileiras,
retorno por botão/histórico, salvar/remover estantes e download/erro de exportação.
As medições de rolagem ficam em `test-results/**/scroll-metrics.json`; os intervalos
entre quadros são diagnósticos, não limites rígidos de aprovação. O CI guarda esses
resultados e screenshots por sete dias. Isso complementa a validação no app
autenticado; não representa uma medição de desempenho em produção.

A posição do acervo fica somente na aba do navegador, separada por conta e busca,
por até 24 horas. Se o navegador bloquear o armazenamento, a navegação continua.
Os downloads incluem somente dados da sessão autenticada, sem capas ou arquivos
EPUB/PDF. CSV inclui notas e citações na coluna final; Markdown inclui também as
localizações de leitura e dos destaques. São exportações para consulta, sem fluxo
de reimportação automática.

Specs e planos de implementação ficam em `docs/superpowers/`. Cada mudança
relevante tem uma spec com as decisões de arquitetura e o porquê delas — é o
melhor lugar para entender por que algo foi feito de um jeito e não de outro.

A RLS por usuário está documentada em [docs/ativar-rls.md](docs/ativar-rls.md):
o banco já tem as policies; o documento cobre o passo a passo para a aplicação
passar a conectar como `book_app` (em vez de `postgres`, que as ignora).
