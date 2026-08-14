# Book Inventory — Spec: Painel e progresso de leitura

**Data:** 2026-08-14
**Status:** Aprovado para planejamento
**Sucede:** bibliotecas (coleções curadas, PR #8)

## Contexto

O acervo está organizado: 1.318 livros importados do Calibre, séries agrupadas, bibliotecas
curadas funcionando. O que falta é o rastreamento da leitura em si — e a medição do banco de
produção mostra que o problema é mais fundo do que parecia.

| Medida | Valor |
|---|---|
| Livros | 1.318 (todos com número de páginas; média 310) |
| Marcados "lendo" | **0** |
| Marcados "lido" | 4 |
| Com data de início | **0** |
| Com data de conclusão | **0** |

Duas conclusões orientaram o desenho:

**O "lidos por ano" que já existe nunca apareceu.** O `/api/reading/stats` calcula `porAno` a
partir de `date_finished`, e nenhum livro tem essa data. O código funciona; faltam os dados.
Construir mais painéis sobre a captura atual produziria mais telas vazias.

**A captura é o gargalo, e ela tem dois casos incompatíveis.** Marcar "lido" hoje não registra
quando. Preencher a data automaticamente com hoje resolveria o caso corrente e arruinaria o
outro: o dono usa o acervo também como diário retroativo — muitos dos livros que ele tem (e
alguns que ainda quer ter) já foram lidos anos atrás, e importaram para a formação dele como
leitor. Carimbar "2026" em centenas de leituras antigas destruiria justamente a estatística
por período que motivou o projeto.

O dono também é específico sobre o progresso: por ter baixa visão, lê com fonte ampliada, o que
faz o e-reader repaginar. A "página 180" do aparelho dele não é a página 180 do livro. Ele lê em
aparelhos diferentes (Kindle, MoonReader, Livros da Apple), alguns mostrando página, outros
percentual.

## Objetivo

Registrar onde o dono está em cada livro, destacar o que ele está lendo, e contar o que foi
lido por período — com dados que nasçam corretos.

**Critério de sucesso:** o dono atualiza o progresso de um livro pelo celular sem digitar data
nem trocar status à mão; ao abrir o site vê esse livro em destaque com o percentual; ao terminar,
um clique registra a conclusão com a data; e o painel passa a mostrar a contagem do mês e do ano.

## Não-objetivos

- **Página inicial própria de leitura** — decidido como segunda rodada (ver AD-5). A faixa no
  topo do catálogo é o experimento que dirá se ela se justifica.
- **Histórico de progresso** (páginas por dia, ritmo, sequências) — ver AD-4.
- **Metas de leitura** ("30 livros em 2027").
- **Data de abandono própria** — `progress_updated_at` já situa aproximadamente quando foi.
- **Reordenar ou fixar livros na faixa** — a ordem é por atualização.
- **Registrar precisão parcial de data** ("li em 2015") — ver AD-2.
- **Corrigir a contagem estimada do rodapé do catálogo** — `estimateTotalBooks` usa `EXPLAIN` e
  erra (estimou 1 onde havia 3). Defeito conhecido, independente desta spec.

## Decisões de arquitetura

### AD-1 — Duas ações distintas para marcar leitura

Trocar o status para "Lido" pelo seletor **não grava data**. Um botão **"Terminei hoje"** grava
status, 100% de progresso e a data de conclusão de uma vez.

É a separação entre "acabei de terminar" e "estou catalogando o que já li". Sem ela, uma das
duas fica errada: ou o dono digita data em todo livro (e não digita — a medição prova), ou
centenas de leituras antigas recebem a data de hoje.

### AD-2 — Data em branco significa "li, não sei quando"

Livro lido sem data é estado válido e permanente. Não há campo de precisão parcial (só o ano),
opção considerada e descartada por acrescentar coluna e interface para um ganho que o dono
avaliou não precisar.

**Consequência obrigatória:** o painel exibe `N lidos sem data registrada` sempre que houver.
Sem essa linha, "Lidos: 4" ao lado de um gráfico por ano vazio parece defeito — e a explicação
some dentro da cabeça de quem desenhou.

### AD-3 — O percentual é a fonte da verdade; a página é forma de entrada

Grava-se `progress_percent` (inteiro, 0–100). Nenhuma coluna guarda a página.

O motivo é o caso do dono: com fonte ampliada, o leitor repagina e a página exibida não
corresponde à do metadado. Guardar a página e derivar o percentual produziria números errados
exatamente para ele. O campo de página existe como **calculadora de entrada** — converte usando
`num_pages` e grava o percentual — e a interface mostra o total usado na conta ("de 310
páginas"), para que uma base errada seja visível na hora.

Percentual é inteiro: nenhum e-reader oferece "57,4%", e 1% de um livro médio deste acervo são
3 páginas. Decimais dariam falsa precisão a um número já aproximado.

### AD-4 — Estado atual mais data de atualização, sem histórico

Guardam-se o progresso corrente e **quando** ele foi atualizado, não a série de atualizações.

A alternativa (tabela de histórico) permitiria ritmo e páginas por dia, mas depende de registro
regular — e este repositório já teve `reading_progress` e `reading_sessions`, removidas no
commit `73fde48` por nunca terem sido usadas. Repetir a estrutura esperando outro resultado seria
ignorar a própria evidência do projeto.

Por uma coluna a mais que o mínimo, `progress_updated_at` responde algo que o dono considerou o
ponto mais valioso da conversa: **quais livros ficaram parados no meio**.

### AD-5 — Faixa no topo do catálogo, não página inicial nova

Os livros em leitura aparecem numa faixa acima da grade, na página que já é a inicial. Trocar a
raiz do site por um painel de leitura muda o que o dono vê primeiro todo dia, decisão grande
demais para tomar antes de existir qualquer dado de leitura.

A faixa **não é renderizada quando não há livros em leitura** — um espaço fixo dizendo "nenhum
livro em leitura" é ruído permanente para informação que a ausência já comunica. Teto de 6
livros: acima disso o catálogo, que é o motivo da página existir, seria empurrado para fora da
tela.

### AD-6 — Salvar progresso muda o status sozinho

Progresso entre 1% e 99% marca o livro como "lendo". Atualizar o progresso de um abandonado
devolve o status para "lendo" — retomar é isso.

Sem esse automatismo a faixa nasce morta: o acervo tem **zero** livros marcados como "lendo",
justamente porque depende de lembrar de trocar um seletor.

Chegar a 100% **não** marca como lido automaticamente: mostra um aviso com o botão que faz isso.
Terminar um livro carimba data e merece um clique consciente.

### AD-7 — "Abandonado" é o quarto status, com motivo próprio

`read_status` ganha `abandonado` ao lado de `lido`, `lendo` e `não lido`, herdando de graça o
filtro da barra lateral, o selo sobre a capa e o seletor da página do livro.

O motivo do abandono é coluna própria (`dnf_reason`), não nota solta em `highlights`: é atributo
do estado, e some junto com ele. Fica gravado mesmo se o livro for retomado e terminado, mas só
é exibido enquanto o status for "abandonado" — é bilhete para o futuro, não histórico público.

Abandonar **preserva o progresso**. "Abandonei em 12%" e "abandonei em 78%" são histórias
diferentes, e o segundo caso é o que faz voltar.

### AD-8 — Abandonado aparece no catálogo e tem card próprio

Continua na grade por padrão, marcado com o selo. Não some atrás de um filtro: o catálogo já
tem um default escondido (posse), e um segundo tornaria imprevisível o que a grade mostra.

No painel ganha card próprio, **fora** da contagem de lidos e da soma de páginas — o livro não
foi lido. Somar o trecho lido misturaria estimativa com número exato numa mesma medida.

### AD-9 — Trava de valores em `read_status`

A migration acrescenta `CHECK` limitando a coluna aos quatro valores. Hoje ela aceita qualquer
texto: um erro de digitação em qualquer ponto do código criaria um status fantasma, invisível
nos filtros e silencioso. Os 1.318 registros atuais só contêm `lido` e `não lido`, então a trava
entra sem conflito.

## Modelo de dados

Três colunas em `books`. Nenhuma tabela nova.

```sql
ALTER TABLE books ADD COLUMN progress_percent integer;
ALTER TABLE books ADD COLUMN progress_updated_at timestamp with time zone;
ALTER TABLE books ADD COLUMN dnf_reason text;

ALTER TABLE books ADD CONSTRAINT books_progress_percent_check
  CHECK (progress_percent IS NULL
         OR (progress_percent >= 0 AND progress_percent <= 100));

ALTER TABLE books ADD CONSTRAINT books_read_status_check
  CHECK (read_status IN ('lido', 'lendo', 'não lido', 'abandonado'));
```

As colunas nascem vazias e nenhum dado existente é alterado. Livro sem progresso não exibe
progresso — `NULL` e `0%` são coisas diferentes: o primeiro é "nunca registrei", o segundo é
"comecei e não avancei".

**O progresso só é exibido quando o status é `lendo` ou `abandonado`.** Isso resolve um caso que
o AD-1 deixaria incoerente: trocar o status para "Lido" pelo seletor não mexe no progresso (o
seletor só mexe em status), então um livro poderia ficar marcado como lido com 45% gravados.
Em vez de acrescentar uma regra de escrita que apaga dado do dono pelas costas, o valor é
simplesmente irrelevante para "lido" e "não lido" — e continua lá, intacto, se ele voltar o
status para "lendo".

## Componentes e fluxo

### Página do livro

Exibição: barra de progresso, `58% · página ~180 de 310`. O til é proposital — é conversão, não
leitura do aparelho.

Entrada: campo de percentual e campo de página, com o total do livro escrito ao lado. Digitar a
página converte e grava percentual (AD-3).

| Ação | Efeito |
|---|---|
| Salvar progresso 1–99% | grava percentual, carimba `progress_updated_at`, status vira "lendo" |
| Salvar progresso em livro abandonado | mesmo efeito: volta para "lendo" |
| Botão "Terminei hoje" | status `lido`, progresso 100, `date_finished` = hoje |
| Trocar status no seletor | muda só o status, sem gravar data |
| Escolher "Abandonado" | revela o campo de motivo; progresso preservado |

Dois avisos condicionais: progresso em 100% com status ainda "lendo" oferece o botão de concluir;
status "lendo" sem atualização há mais de 14 dias mostra **"Parado há N dias"**.

A data de conclusão permanece em campo editável — terminar numa sexta e registrar na segunda é
normal.

### Faixa do catálogo

Livros com status `lendo`, ordenados por `progress_updated_at` decrescente, no máximo 6. Cada um
com capa (reusando `Photo`, que já desenha selo e estrelas), título, percentual e barra. Passados
14 dias sem atualização, o "Parado há N dias" acompanha.

Sem livros em leitura, a faixa não é renderizada (AD-5).

### Painel

Cards: **Total, Lendo, Lidos, Abandonados, Páginas**.

Blocos novos: **Neste mês** e **Neste ano**, cada um com livros concluídos e a soma das páginas
desses livros, contados por `date_finished` dentro do período. A lista "lidos por ano" continua.

Linha condicional: `N lidos sem data registrada` (AD-2).

### Rota

`PATCH /api/books/[id]`, que já atende o acompanhamento, passa a aceitar `progressPercent` e
`dnfReason`, e aplica as transições de status do AD-6.

## Tratamento de erros

| Situação | Resposta | Mensagem ao dono |
|---|---|---|
| `progressPercent` fora de 0–100 | 400 | "O progresso deve estar entre 0 e 100" |
| `progressPercent` não inteiro | 400 | "O progresso deve ser um número inteiro" |
| `read_status` fora dos quatro valores | 400 | "Status de leitura inválido" |
| Página informada maior que o total do livro | 400 | "O livro tem N páginas" |
| Conversão de página em livro sem `num_pages` | — | o campo de página não é exibido; só o percentual |
| Falha de rede ao salvar | — | mensagem inline, o valor digitado permanece na tela |

O último caso importa: perder o número digitado por causa de rede instável no celular faria o
dono digitar de novo — e desistir na terceira vez.

## Testes

**Migration e schema**
- As três colunas existem; livros existentes seguem com elas nulas.
- A trava de `read_status` aceita os quatro valores e recusa um quinto.
- A trava de `progress_percent` recusa −1 e 101, aceita 0, 100 e nulo.

**Rota e transições**
- Salvar 45% marca o livro como "lendo" e carimba a data de atualização.
- Salvar progresso em livro abandonado devolve o status para "lendo".
- "Terminei hoje" grava status, 100% e data de conclusão juntos.
- Trocar status pelo seletor não grava data alguma.
- 400 para progresso fora de faixa, não inteiro, e status inválido.
- Abandonar preserva o progresso e grava o motivo.
- Trocar o status para "lido" pelo seletor preserva o progresso gravado (a exibição é que o
  omite) — nenhuma rota apaga progresso do dono.

**Consultas**
- Contagem do mês pega só livros concluídos no mês corrente — um livro terminado em 31 de
  dezembro não conta em janeiro.
- Contagem do ano idem, e as páginas somam apenas os livros do período.
- Abandonados não entram em lidos nem na soma de páginas.
- Livros em leitura vêm ordenados pela atualização mais recente, limitados a 6.
- A contagem de lidos sem data reflete os livros sem `date_finished`.

**Telas** — o projeto roda testes em ambiente Node, sem DOM; componentes não têm teste
automatizado. A verificação é `pnpm typecheck`, `pnpm lint`, `pnpm build` e uso real. Limitação
conhecida, registrada.

## Riscos

**O painel por período começa quase vazio, e isso é esperado.** Só o que for concluído daqui
para frente entra no gráfico. O aviso do AD-2 existe para que isso não seja lido como defeito,
mas vale o dono saber antes de abrir.

**O automatismo do AD-6 pode surpreender.** Salvar progresso muda o status sem pedir. É
deliberado — sem isso a faixa não se popula — mas é o comportamento com maior chance de gerar
"por que ele mudou isso sozinho?". Se incomodar, a saída é o seletor, que continua mandando.

**A RLS segue inerte em produção** enquanto a aplicação conectar como `postgres` em vez de
`book_app`. Pendência herdada das specs anteriores, não introduzida aqui.
