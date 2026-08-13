# Book Inventory — Spec: Sync incremental do Calibre + livros manuais e lista de desejados

**Data:** 2026-08-13
**Status:** Aprovado para planejamento
**Sucede:** o reescopo para rastreador pessoal (PR #2)

## Contexto

O rastreador está funcionando: 1.318 livros importados do Calibre, com capas, sob a conta
Supabase do dono. Mas o import é uma operação de mão única — `insert ... onConflictDoNothing()`
sem alvo de conflito, numa tabela `books` sem constraint única. **Rodar o import de novo hoje
duplicaria os 1.318 livros**, e as cópias novas viriam como "não lido", divergindo das
marcações feitas nas antigas.

Isso deixa o dono sem caminho para duas necessidades reais: manter o catálogo em dia conforme
a biblioteca Calibre cresce, e registrar livros que ainda não possui.

Duas verificações contra os dados reais orientaram o desenho:

- **O Calibre expõe `uuid` estável para 100% dos livros** (1.318/1.318), além de
  `last_modified`. É uma chave de identidade que sobrevive a mudanças de título, autor e capa.
- **Só 48% dos livros têm ISBN** (633/1.318); 459 não têm identificador nenhum, e os que têm
  vêm de fontes heterogêneas (Kobo, Amazon, Goodreads), com tipos malformados
  (`urnisbn/9780753525173`, tipos que são o próprio número). ISBN **não** serve como chave.

Verificação adicional: **não existe nenhum dado de tracking ainda** (0 status marcados, 0
avaliações, 0 datas, 0 notas). Os 1.318 registros atuais são descartáveis, o que dispensa
qualquer heurística de "adoção" das linhas antigas — que não têm `calibre_uuid`.

## Objetivo

Tornar a ingestão do Calibre **idempotente e incremental**, preservando o tracking do dono; e
permitir registrar livros fora do Calibre, incluindo os que deseja adquirir.

**Critério de sucesso:** o dono roda `pnpm db:import-calibre` quantas vezes quiser — livros
novos entram, metadados alterados atualizam, nada duplica, e status/avaliações/datas/notas
nunca são tocados. Pelo site, ele adiciona um livro que não tem no Calibre e o vê numa lista de
desejados separada do catálogo.

## Não-objetivos

- Casamento automático entre um livro desejado e o mesmo livro vindo depois do Calibre (ver
  AD-4). A transição é manual, por decisão.
- Sync bidirecional: o site nunca escreve no Calibre.
- Capa para livros manuais (ver AD-6). Fica o placeholder já existente.
- Importar de Goodreads/Kobo/Amazon.

## Decisões de arquitetura

### AD-1 — `calibre_uuid` como chave de identidade

**Decisão:** `books.calibre_uuid` (o `uuid` do Calibre), único por usuário, é a chave que o
sync usa para decidir inserir vs. atualizar.

**Alternativas descartadas:**
- *ISBN*: cobre 48% da biblioteca e os dados estão sujos. Falharia justamente nos livros
  adicionados por Kobo/Amazon.
- *Título + autor*: casa edições diferentes, traduções e grafias distintas de autor como se
  fossem o mesmo livro — funde registros e perde notas no livro errado.
- *`books.id` do Calibre*: é estável no mesmo banco, mas quebra se a biblioteca for recriada.
  O `uuid` sobrevive.

### AD-2 — `source` e `owned` como campos independentes

**Decisão:** duas colunas com responsabilidades distintas.

- `source`: `'calibre'` | `'manual'` — de onde o registro veio. **O sync só toca em
  `'calibre'`.** Livros manuais são invioláveis.
- `owned`: boolean — se o dono possui o livro. A lista de desejados é
  `source='manual' AND owned=false`.

**Motivo:** posse não é status de leitura. Um livro possuído pode estar "não lido"; um
desejado também. Enfiar "desejado" em `read_status` colidiria os dois conceitos e quebraria as
estatísticas de leitura.

### AD-3 — Calibre manda no catálogo, site manda no tracking

**Decisão:** quando um livro já existe, o sync sobrescreve os metadados com os do Calibre
(título, autores, gênero, editora, páginas, ano, série, idioma, capa) e **nunca** escreve em
`read_status`, `my_rating`, `date_started`, `date_finished`, nem em `highlights`.

**Motivo:** os dois conjuntos não se sobrepõem. O Calibre é a ferramenta onde o dono cura
metadados; o site é onde acompanha leitura. A regra é previsível e nunca perde tracking.

**Descartado:** preservar edições feitas no site campo a campo (exigiria rastrear "este campo
foi editado manualmente" por coluna) — complexidade sem retorno, já que o site não edita
metadados.

### AD-4 — Transição desejado → possuído é manual

**Decisão:** quando um livro desejado passa a existir no Calibre, o sync o insere como registro
novo. O desejado antigo permanece até o dono removê-lo, por um botão **"Já tenho"** na lista de
desejados.

**Motivo:** o casamento automático precisaria de ISBN (48% de cobertura) ou de heurística
título+autor (que funde livros errados). O custo do erro é assimétrico: uma duplicata é
visível e trivial de resolver; um casamento errado funde dois livros e perde notas em silêncio.
A frequência do evento é baixa — o dono adquire livros desejados esporadicamente, não às
centenas.

**Atenuante:** como o desejado é `source='manual'`, o sync nunca o toca — ele apenas coexiste
até a remoção. Não há momento de estado inconsistente.

### AD-5 — O catálogo mostra só o que é possuído, mas nada fica inalcançável

**Decisão:** a listagem principal filtra `owned = true` por padrão. Os desejados
(`source='manual' AND owned=false`) vivem em rota própria (`/desejados`). O catálogo ganha um
filtro de **posse** (`possuídos` | `não possuídos` | `todos`, default `possuídos`) no painel de
filtros já existente.

**Motivo:** o requisito do dono é que os desejados não "sujem" o catálogo — daí o default. Mas
sem o filtro, um livro do Calibre que virou `owned=false` (AD-3, removido da biblioteca) não
apareceria nem no catálogo nem em `/desejados`: o histórico de leitura ficaria preservado no
banco e inalcançável na interface, contradizendo o próprio motivo de preservá-lo. O filtro
resolve com uma opção, reaproveitando `components/filters.tsx`.

### AD-7 — Estatísticas de leitura ignoram posse

**Decisão:** as métricas de leitura (`lidos`, `lendo`, `páginas lidas`, `lidos por ano`) contam
**todos** os livros, possuídos ou não. Apenas a métrica de acervo (`total`, `não lidos`)
reflete `owned = true`.

**Motivo:** apagar um arquivo do Calibre é uma decisão sobre armazenamento, não sobre a memória
de leitura. Se as estatísticas filtrassem por posse, deletar um livro lido apagaria a leitura
do histórico — exatamente o que o AD-3 existe para impedir.

### AD-6 — Livros manuais sem capa na v1

**Decisão:** o formulário de livro manual não aceita capa. `image_url` fica nulo e a UI mostra
o placeholder com o título (comportamento já implementado no componente `Photo`).

**Motivo:** aceitar URL externa exigiria liberar hosts arbitrários no `next.config.ts`
(`remotePatterns`), com o risco de SSRF/imagem hostil; aceitar upload exigiria uma tela de
upload e política de bucket. Ambos são desproporcionais ao valor — a maioria dos desejados vira
livro do Calibre (com capa) em pouco tempo.

## Modelo de dados

```sql
ALTER TABLE books ADD COLUMN calibre_uuid     text;
ALTER TABLE books ADD COLUMN calibre_modified text;
ALTER TABLE books ADD COLUMN source           text NOT NULL DEFAULT 'calibre';
ALTER TABLE books ADD COLUMN owned            boolean NOT NULL DEFAULT true;

ALTER TABLE books ADD CONSTRAINT books_source_check
  CHECK (source IN ('calibre','manual'));

-- Idempotência do sync: um uuid do Calibre por usuário.
CREATE UNIQUE INDEX books_user_calibre_uuid_unique
  ON books (user_id, calibre_uuid) WHERE calibre_uuid IS NOT NULL;

CREATE INDEX idx_books_user_owned ON books (user_id, owned);
```

Notas de desenho:

- O índice único é **parcial** (`WHERE calibre_uuid IS NOT NULL`): livros manuais não têm uuid
  e não competem pela constraint. É isso que permite os dois tipos de registro na mesma tabela.
- `calibre_modified` guarda o `last_modified` do Calibre, para o sync pular livros inalterados.
- `source` e `owned` têm default compatível com o que já existe (tudo veio do Calibre e é
  possuído), então a migration não precisa de backfill.

**Limpeza única:** os 1.318 registros atuais não têm `calibre_uuid` e seriam vistos como
manuais pelo sync. Como não há tracking algum, a migration os remove
(`DELETE FROM books WHERE source = 'calibre' AND calibre_uuid IS NULL`), e o primeiro sync
repovoa com uuid. As capas órfãs no Storage são sobrescritas no mesmo caminho
(`{userId}/{bookId}/cover.jpg`) e não requerem limpeza.

## Comportamento do sync

Para cada livro do Calibre, comparando por `(user_id, calibre_uuid)`:

| Situação | Ação |
|---|---|
| No Calibre, ausente no banco | Insere: `source='calibre'`, `owned=true`, metadados + capa |
| Nos dois, `last_modified` diferente | Atualiza metadados e capa. Não toca tracking |
| Nos dois, `last_modified` igual | Pula (sem re-upload de capa) |
| No banco (`source='calibre'`), ausente no Calibre | `owned = false`. Preserva tudo o mais |
| `source='manual'` | Nunca tocado |

Ao final, imprime um resumo: `novos`, `atualizados`, `não-possuídos`, `pulados`, `erros`.

**Autores:** continuam resolvidos por `authorId(nome)` (slug determinístico). Numa atualização,
os vínculos `book_to_author` do livro são recalculados para refletir o Calibre.

**Desempenho:** o filtro por `calibre_modified` faz o caso comum (poucas mudanças) processar
só o que mudou. O primeiro run processa 1.318; os seguintes, segundos.

## Livros manuais e lista de desejados

**`POST /api/books`** — cria livro manual. Campos: `title` (obrigatório), `authors` (lista de
nomes, opcional), `publicationYear`, `numPages`, `publisher`, `genre` (opcionais), `owned`
(boolean, default `false` — o caso comum é registrar um desejado). Grava `source='manual'`,
`calibre_uuid=null`. Valida no servidor: título não-vazio; `numPages`/`publicationYear`
inteiros positivos quando presentes. Roda em `withUser`.

**`DELETE /api/books/[id]`** — remove um livro. **Só permite `source='manual'`**; um livro do
Calibre responde 409 com mensagem explicando que ele deve ser removido do Calibre e
sincronizado. Isso protege o catálogo de exclusões acidentais e mantém a regra do AD-3. Roda em
`withUser`; o RLS garante posse.

**`/desejados`** — página listando `source='manual' AND owned=false`, ordenada por criação.
Cada item traz o botão **"Já tenho"**, que chama o `DELETE`. Se o livro tiver notas, a UI pede
confirmação nomeando quantas serão perdidas.

**Formulário de adicionar** — na página `/desejados`, cria o livro com `owned=false`. O mesmo
endpoint aceita `owned=true` para registrar um livro possuído fora do Calibre (por exemplo, um
físico), mas a v1 expõe só o fluxo de desejado; o campo existe para não exigir migration depois.

**Catálogo** — `fetchBooksWithPagination` e `estimateTotalBooks` passam a aceitar um filtro de
posse, com default `owned = true` (AD-5). O parâmetro entra em `SearchParams` (`posse`) e no
painel `components/filters.tsx` como as três opções.

**Estatísticas** — métricas de leitura (`lidos`, `lendo`, `páginas lidas`, `porAno`) contam
todos os livros; `total` e `naoLidos` contam só `owned = true` (AD-7).

## Tratamento de erros

- **Falha de capa no sync:** registra aviso e segue; o livro é inserido/atualizado sem capa.
  Storage nunca aborta a ingestão (padrão herdado).
- **Livro problemático no sync:** cada livro é processado isoladamente; um erro incrementa o
  contador e não interrompe os demais.
- **`metadata.db` inexistente:** erro claro citando o caminho e a flag `--path=`.
- **`DELETE` em livro do Calibre:** 409 com mensagem em português, não 500.
- **`POST` inválido:** 400 antes de tocar o banco, com a mensagem do campo ofensor.
- Todas as rotas usam `errorResponse` (log estruturado + `requestId`; mensagem genérica ao
  cliente).

## Testes

- **Idempotência (o teste central):** rodar o sync duas vezes sobre a mesma biblioteca resulta
  no mesmo número de livros. Sem esse teste, a spec não cumpre seu objetivo.
- **Preservação de tracking:** livro com `read_status='lido'`, `my_rating=5`, datas e uma nota;
  sync com metadados alterados no Calibre → título atualiza, tracking intacto.
- **Livro removido do Calibre:** vira `owned=false`, mantém notas e status; não é apagado.
- **Livro manual intocado:** sync não altera nem remove `source='manual'`.
- **Pulo por `calibre_modified`:** livro inalterado não re-sobe capa (asserção sobre o mock de
  `uploadCover`).
- **`POST /api/books`:** cria manual com `source='manual'`/`owned=false` em `withUser`; título
  vazio → 400; `numPages` negativo → 400.
- **`DELETE /api/books/[id]`:** apaga manual; livro do Calibre → 409; roda em `withUser`.
- **Catálogo filtra `owned`:** livro com `owned=false` não aparece na listagem padrão, e
  aparece com o filtro de posse em `não possuídos`/`todos` (AD-5).
- **Estatísticas ignoram posse (AD-7):** livro lido com `owned=false` continua contando em
  `lidos`, `páginas lidas` e `porAno`; `total` não o conta. É o teste que prova que apagar do
  Calibre não apaga o histórico.
- CI (typecheck + lint + testes) permanece gate bloqueante.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| A limpeza única apagar tracking real | Verificado: 0 status, 0 avaliações, 0 datas, 0 notas. A migration só remove `source='calibre' AND calibre_uuid IS NULL`. Se houver tracking na hora de aplicar, **abortar e reavaliar** |
| Sync sobrescrever tracking por engano | O `UPDATE` lista explicitamente as colunas de metadados; teste dedicado prova a preservação |
| Duplicata desejado ↔ Calibre incomodar | Aceito por decisão (AD-4); botão "Já tenho" torna a resolução um clique |
| Capa re-enviada a cada sync (lentidão) | `calibre_modified` faz pular inalterados; teste cobre |
| `uuid` do Calibre mudar se a biblioteca for recriada | Nesse caso o sync trataria tudo como novo. Documentar: recriar a biblioteca do zero exige nova limpeza |
