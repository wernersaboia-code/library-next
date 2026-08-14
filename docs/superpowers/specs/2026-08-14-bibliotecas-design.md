# Book Inventory — Spec: Bibliotecas (coleções curadas)

**Data:** 2026-08-14
**Status:** Aprovado para planejamento
**Sucede:** identidade visual do acervo e enriquecimento de desejados (PR #5)

## Contexto

O acervo está em uso real: 1.318 livros importados do Calibre, com capas, séries agrupadas
corretamente e o sync idempotente. O que falta é o dono conseguir **organizar o acervo do jeito
dele** — hoje a única forma de agrupar livros é pelos filtros derivados de metadados do Calibre.

O campo que mais se aproximaria de uma organização temática, `genre`, não sustenta o papel.
Medido no banco de produção:

- **606 de 1.318 livros** têm `genre` preenchido (46%) — o import guarda apenas a **primeira**
  tag do Calibre, então quem tem várias tags perde as demais e quem não tem nenhuma fica vazio.
- São **184 valores distintos**, misturando idioma, capitalização e níveis de abstração:
  `Fiction` (118), `fantasy` (45), `Adult` (39), `Horror` (33), `Fiction & Literature` (18),
  `Speculative`, `American`, `Anthologies`.

Isso é resíduo de tags, não uma taxonomia. Agrupamentos como "Maratona Stephen King" ou
"Ler em 2027" sequer são expressáveis como propriedade de um livro — são decisão do dono.

O dono descreveu o que quer como "bibliotecas": conjuntos nomeados que servem tanto para tema
permanente quanto para intenção passageira, sem distinção entre os dois usos.

## Objetivo

Permitir que o dono crie conjuntos nomeados de livros, monte-os em lote a partir do catálogo,
ajuste-os livro a livro, e navegue por eles.

**Critério de sucesso:** o dono cria uma biblioteca, adiciona nela vários livros de uma vez a
partir do catálogo, e depois alcança essa biblioteca por três caminhos — a página de
bibliotecas, o filtro do catálogo, e a etiqueta na página de um livro que pertence a ela.

## Não-objetivos

- **Adicionar todo o resultado de um filtro de uma vez** — o próximo passo natural (ver AD-5),
  fora desta spec.
- **Seleção que sobrevive à paginação** (ver AD-5).
- **Ordenar livros à mão dentro da biblioteca** — a ordem é a de entrada.
- **Capa, cor ou descrição da biblioteca** — nome e lista bastam.
- **Bibliotecas aninhadas** e **compartilhamento** com outras pessoas.
- **Criar bibliotecas a partir das tags do Calibre** — as tags ficam no Calibre, a curadoria
  fica aqui; importar as tags traria de volta a bagunça dos 184 valores.
- **Aposentar o campo `genre`** — decisão separada, depois que as bibliotecas provarem valor.
  Até lá o filtro de gênero continua funcionando como está.
- **Painel e progresso de leitura** — é a próxima spec, já acordada: destaque do que está sendo
  lido, progresso por página/percentual, e contagem por período (ano/mês, páginas).

## Decisões de arquitetura

### AD-1 — Curadoria explícita, não critério dinâmico

Uma biblioteca é uma lista de livros escolhidos pelo dono, gravada em tabela de vínculo. A
alternativa considerada era a "playlist inteligente": guardar critérios (`genre = 'Horror' AND
num_pages > 400`) e resolver a lista na hora, o que se manteria atualizada sozinha.

Foi descartada por duas razões independentes. Primeira, os dados não sustentam: com 46% de
cobertura e 184 valores bagunçados, os critérios disponíveis produziriam listas ruins. Segunda,
e decisiva: os agrupamentos que o dono descreveu não derivam de nenhum atributo do livro.
Nenhum critério expressa "Ler em 2027".

### AD-2 — Biblioteca não tem tipo

O dono usa o mesmo conceito para tema permanente ("Terror") e para intenção passageira
("Próximos da fila"). Não há campo de tipo, nem comportamento diferente por tipo. Introduzir a
distinção exigiria que o dono classificasse cada biblioteca numa taxonomia que ele mesmo disse
não fazer na cabeça dele.

### AD-3 — Qualquer livro entra, e o não possuído se identifica

Livros da lista de desejados (`owned = false`) podem pertencer a bibliotecas, para que o dono
planeje ("Maratona King" incluindo os que ainda faltam comprar).

Como consequência obrigatória, a grade de uma biblioteca marca com o selo **"Quero ter"** todo
livro não possuído, reaproveitando o `CoverBadges` que já desenha "Lido"/"Lendo" e as estrelas.
Sem essa marcação o dono olharia a estante sem saber o que de fato tem — o que anularia o
ganho de misturar os dois.

### AD-4 — Muitos-para-muitos em tabela própria; `genre` intocado

Um livro pertence a quantas bibliotecas o dono quiser, o que exige tabela de vínculo. Nenhuma
coluna é acrescentada a `books`, e o campo `genre` não é alterado nem migrado: o filtro de
gênero existente continua funcionando durante e depois desta entrega.

### AD-5 — A seleção múltipla vale dentro da página atual

O modo de seleção do catálogo opera sobre os 28 livros da página corrente; paginar limpa a
seleção.

Manter a seleção viva através da navegação exigiria carregá-la na URL ou num armazenamento
paralelo, e ambos falham de formas sutis — marcar 40 itens em 3 páginas e perder tudo num
refresh é pior que um limite claro e previsível. O caso real que motivaria a seleção
multi-página (montar uma biblioteca grande de uma vez) é melhor resolvido pelo botão
"adicionar todo o resultado do filtro", registrado como próximo passo: filtrar por autor e
adicionar os 30 resultados resolve sem estado frágil.

### AD-6 — As rotas de vínculo operam em lote e são idempotentes

`POST`/`DELETE` de vínculo recebem **lista** de livros mesmo quando é um só, de modo que a
seleção múltipla (28 ids) e a marcação individual (1 id) usem o mesmo código.

Adicionar um livro que já está na biblioteca **não é erro**: a inserção ignora o conflito e a
resposta informa quantos vínculos foram efetivamente criados. O dono seleciona capas sem
lembrar quais já estavam lá; derrubar o lote inteiro por uma repetição seria hostil.

### AD-7 — A RLS do vínculo checa a biblioteca e o livro

`book_collections` não tem `user_id`; a posse é herdada, como em `book_to_author`. A policy
exige que **ambos** — a biblioteca e o livro — pertençam ao usuário corrente.

Checar só a biblioteca deixaria uma brecha teórica: vincular um livro alheio a uma biblioteca
própria. A checagem dupla custa um `EXISTS` a mais e fecha o caso.

### AD-8 — Nome único por dono, ignorando maiúsculas

Índice único em `(user_id, lower(name))`. O nome é o único identificador que o dono enxerga;
permitir "Terror" e "terror" lado a lado cria duas estantes que ele acredita ser uma só.
Tentar criar uma repetida responde 409 com mensagem explícita, não erro de banco.

## Modelo de dados

Duas tabelas novas. Nenhuma alteração em tabelas existentes.

```sql
CREATE TABLE collections (
  id         serial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX collections_user_name_unique
  ON collections (user_id, lower(name));

CREATE TABLE book_collections (
  book_id       integer NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  collection_id integer NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, book_id)
);

CREATE INDEX idx_book_collections_book ON book_collections (book_id);
```

A chave primária composta já serve de índice para listar uma biblioteca; o índice extra em
`book_id` atende as etiquetas da página do livro.

**Cascades, deliberados:** apagar uma biblioteca remove os vínculos e **não toca nos livros**;
apagar um livro (o botão "Apagar" dos desejados) leva junto seus vínculos. Nenhum caminho
apaga livro por causa de biblioteca.

**RLS:** `collections` ganha policy direta por `user_id`, no mesmo laço das demais tabelas com
dono. `book_collections` segue o padrão de `book_to_author`, com a checagem dupla do AD-7.
Ambas com `ENABLE` + `FORCE ROW LEVEL SECURITY`.

## Componentes e fluxo

### Rotas

| Rota | Método | Faz |
|---|---|---|
| `/api/collections` | `GET` | lista as bibliotecas do dono com a contagem de livros |
| `/api/collections` | `POST` | cria a partir do nome |
| `/api/collections/[id]` | `PATCH` | renomeia |
| `/api/collections/[id]` | `DELETE` | apaga a biblioteca; livros permanecem |
| `/api/collections/[id]/books` | `POST` | vincula uma lista de livros |
| `/api/collections/[id]/books` | `DELETE` | desvincula uma lista de livros |

Todas passam por `withUser`. Limite de **200 livros por requisição** nas rotas de vínculo: a
página do catálogo mostra 28, então o teto nunca é encostado em uso normal, e existe para que
um pedido malformado não vire uma transação gigante.

### Telas

**`/bibliotecas`** — lista cada biblioteca com nome e quantidade de livros, ordenadas **por nome**
(o dono procura pelo nome, não por data de criação), com um campo para criar nova e
renomear/apagar em cada linha. A contagem inclui livros não possuídos, coerente com o AD-3. A
confirmação de apagar diz quantos vínculos serão desfeitos e deixa claro que os livros
continuam no acervo.

**`/bibliotecas/[id]`** — a biblioteca aberta, com as capas em grade, reusando `BooksGrid`.
Livros não possuídos recebem o selo "Quero ter" (AD-3). Ordem por `added_at`.

**Catálogo** — filtro por biblioteca através do parâmetro **`bib=<id>`** em `SearchParams`
(id numérico, não nome: renomear uma biblioteca não pode invalidar um link salvo). Um seletor
na barra lateral, ao lado de gênero e série, alimentado pelas bibliotecas do dono. Combina com
os filtros existentes: da Maratona King, só os não lidos. Como todo filtro, entra pelo
`applyFilter`, que zera a paginação.

**Página do livro** — as bibliotecas do livro aparecem como etiquetas clicáveis que levam à
biblioteca, mais um controle para marcar e desmarcar. Os nomes vêm agregados na consulta que já
monta o livro, como os autores — sem uma segunda ida ao banco.

**Modo seleção no catálogo** — botão "Selecionar" no topo; ativado, cada capa ganha caixa de
marcação e uma barra fixa no rodapé mostra "N selecionados" com as ações de adicionar a uma
biblioteca ou cancelar. Barra no rodapé porque o uso principal é no celular.

**Navegação** — "Bibliotecas" entra na `NavBar`, ao lado de "Acervo" e "Quero ter".

**Nomenclatura:** a interface diz "bibliotecas" (a palavra do dono); o código diz `collections`,
seguindo a regra do projeto — interface e mensagens em português, código em inglês.

## Tratamento de erros

| Situação | Resposta | Mensagem ao dono |
|---|---|---|
| Nome vazio ou só espaços | 400 | "Dê um nome à biblioteca" |
| Nome já existente (ignorando maiúsculas) | 409 | "Já existe uma biblioteca com esse nome" |
| Biblioteca inexistente ou de outro dono | 404 | "Biblioteca não encontrada" |
| `id` não numérico na rota | 400 | "id inválido" |
| Lista de livros vazia ou malformada | 400 | "Informe ao menos um livro" |
| Mais de 200 livros na requisição | 400 | "No máximo 200 livros por vez" |
| Livro que não é do dono na lista | 200 | ignorado silenciosamente; a contagem devolvida reflete o que entrou |
| Falha de rede na interface | — | mensagem inline, sem derrubar a página |

O livro alheio é ignorado em vez de recusado de propósito: a RLS já o torna invisível, e
responder "esse livro não é seu" confirmaria a existência de um registro que o dono não deveria
enxergar.

## Testes

**Migration e schema**
- As duas tabelas existem com RLS ativa e forçada.
- O índice único ignora maiúsculas: "Terror" e "terror" colidem.
- Apagar biblioteca remove vínculos e preserva os livros.
- Apagar livro remove seus vínculos.

**Rotas**
- Criar, renomear e apagar uma biblioteca.
- 409 no nome duplicado; 400 no nome vazio.
- Vincular lote; repetir o mesmo lote não falha e não duplica (AD-6).
- 400 acima de 200 livros; 400 com lista vazia.
- Livro de outro dono não é vinculado e não aparece na contagem (AD-7).
- Desvincular lote.

**Consultas**
- Lista de bibliotecas traz a contagem correta de livros.
- Filtro do catálogo por biblioteca devolve exatamente os livros vinculados, e combina com os
  filtros existentes.
- A consulta do livro traz as bibliotecas dele agregadas.

**Telas** — o projeto roda testes em ambiente Node, sem DOM; componentes não têm teste
automatizado. A verificação das telas é `pnpm typecheck`, `pnpm lint`, `pnpm build` e uso real,
como nas entregas anteriores. Isto está registrado como limitação conhecida, não como lacuna
esquecida.

## Riscos

**A RLS continua inerte em produção.** As policies novas nascem corretas, mas só terão efeito
quando a aplicação conectar com o papel `book_app` em vez de `postgres`. É a pendência herdada
das specs anteriores, não introduzida aqui — mas vale repetir que uma policy correta e inerte
não protege nada.

**O modo de seleção é a parte mais delicada da interface.** É o único estado de cliente
significativo do projeto, e é onde mora o maior risco de comportamento estranho no celular. O
limite do AD-5 existe justamente para manter esse estado pequeno e descartável.

**A contagem de livros por biblioteca pode ficar cara** se o acervo crescer muito, por ser um
`count` agregado a cada visita à página. Com 1.318 livros e dezenas de bibliotecas é irrelevante;
fica registrado como coisa a observar, não a otimizar agora.
