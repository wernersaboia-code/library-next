# Book Inventory — Spec: Identidade visual do acervo e enriquecimento de desejados

**Data:** 2026-08-14
**Status:** Aprovado para planejamento
**Sucede:** o sync incremental do Calibre (PR #4)

## Contexto

O rastreador está em uso: 1.318 livros importados do Calibre, com capas, e o sync já é
idempotente. Usando o app, o dono identificou quatro lacunas.

Três são de **leitura visual do acervo**: no grid de capas não há como distinguir o que já foi
lido nem o que foi bem avaliado — a informação existe no banco (`read_status`, `my_rating`) mas
não aparece na capa. A quarta é sobre a **lista de desejados**: um livro que ele quer adquirir
entra sem capa e sem nenhuma informação que ajude a decidir se vale a pena.

Sobre a decisão de compra, o dono foi específico: ele descobre livros por recomendação
(Reddit, sites) e quer a nota dos leitores — mas **sempre acompanhada do número de votos**,
porque "livros são muito pessoais" e uma nota baixa vinda de poucos votos diz mais sobre o
humor de quem votou que sobre o livro.

Duas verificações contra dados reais orientaram o desenho:

- **A Open Library atende sem chave de API nem cadastro**, numa única chamada, devolvendo
  título, autor, ano, páginas, capa, `ratings_average` e `ratings_count`.
- **A busca precisa de escolha humana.** Consultando `the shining stephen king`, o primeiro
  resultado foi o livro certo, mas o segundo e o terceiro eram coletâneas
  (`Works (Carrie / Night Shift / Salem's Lot / Shining)`), uma delas com nota **1.00 baseada
  em 1 voto**. Pegar o primeiro resultado automaticamente encheria a lista de coletâneas e de
  notas estatisticamente inúteis — exatamente o oposto do objetivo.

## Objetivo

Tornar o acervo legível de relance e dar à lista de desejados informação suficiente para
decidir uma compra.

**Critério de sucesso:** no grid, o dono distingue à primeira vista o que leu e como avaliou.
Na lista de desejados, cada livro tem capa, a nota dos leitores com o número de votos, e um
espaço para o comentário dele.

## Não-objetivos

- Coleções/bibliotecas curadas (Nebula, Stephen King) — **é a próxima spec**, já desenhada em
  conversa: tabelas `collections` + `book_collections` (muitos-para-muitos), etiquetas
  clicáveis na página do livro, `/colecoes`, e seleção múltipla no catálogo para montar uma
  coleção em lote.
- Importar de Goodreads/Kobo/Amazon.
- Substituir a capa de livros vindos do Calibre (ver AD-5).
- Editar metadados de catálogo pelo site.

## Decisões de arquitetura

### AD-1 — Selo e estrelas sobre a capa, com dados já existentes

**Decisão:** o componente `Photo` passa a receber `readStatus` e `myRating` e desenha, sobre a
capa: uma etiqueta no topo quando `read_status` é `'lido'` ou `'lendo'`, e uma faixa de
estrelas no rodapé quando `my_rating` não é nulo. Livro não lido e sem avaliação fica
exatamente como hoje.

**Consequência que não é só CSS:** `fetchBooksWithPagination` seleciona hoje apenas
`id/title/image_url/thumbhash`. Passa a selecionar também `read_status` e `my_rating`, e o tipo
`Book` acompanha.

### AD-2 — A busca externa apresenta candidatos; o dono escolhe

**Decisão:** a busca devolve até 5 resultados e o dono seleciona qual é o seu livro. Nunca
adoção automática do primeiro.

**Motivo:** medido contra a API real — o primeiro resultado nem sempre é o livro certo, e
coletâneas aparecem entre os primeiros. Um clique elimina o problema; sem ele, a feature
entrega dado errado com aparência de certo.

### AD-3 — Nota e número de votos são inseparáveis

**Decisão:** onde a nota aparecer, o número de votos aparece junto (`4,32 ★ · 1.847 votos`).
Resultado sem avaliação exibe "sem avaliações", não um espaço vazio.

**Motivo:** requisito explícito do dono. Uma nota sem denominador induz a erro — é a diferença
entre 4,8 com 22 votos e 4,8 com 3.000.

### AD-4 — A capa escolhida é baixada para o Supabase Storage

**Decisão:** ao escolher um resultado, o **servidor** baixa a imagem e a envia ao Storage via o
`uploadCover(userId, bookId, buffer, ext)` já existente. Não guardamos URL externa.

**Alternativa descartada:** guardar a URL da Open Library. Economizaria cota, mas criaria
dependência externa (imagem quebrada se o item sair do catálogo) e exigiria liberar
`covers.openlibrary.org` no `next.config.ts`.

**Motivo decisivo:** o upload manual (AD-6) precisa gravar no Storage de qualquer forma. Com
esta decisão os dois caminhos terminam na mesma função, e o `Photo` continua com um único tipo
de capa. Custo: ~50–100KB por capa, contra 1GB do plano free.

### AD-5 — Capa personalizada só para livros manuais

**Decisão:** as rotas de capa (busca externa e upload) recusam livros com `source='calibre'`,
respondendo 409.

**Motivo:** o sync já estabeleceu que o Calibre manda no catálogo. Uma capa enviada pelo site
para um livro do Calibre seria sobrescrita no próximo sync em que o `last_modified` mudasse —
uma promessa que o sistema não pode cumprir. Melhor recusar com uma mensagem clara
("troque a capa no Calibre e sincronize") do que aceitar e perder depois.

### AD-6 — Upload manual como rede de segurança

**Decisão:** cada item da lista de desejados tem "Enviar capa", que aceita um arquivo local.

**Motivo:** a cobertura da Open Library é fraca em livros brasileiros e edições em português. O
upload não é alternativa à busca — é o que garante que sempre haja um caminho.

### AD-7 — O servidor constrói a URL da capa; o cliente nunca a fornece

**Decisão:** a rota de busca devolve o `coverId` numérico da Open Library. Ao aplicar a capa, o
cliente envia esse id, e o **servidor** monta a URL
(`https://covers.openlibrary.org/b/id/{coverId}-L.jpg`) e faz o download. A rota **não** aceita
uma URL arbitrária.

**Motivo:** aceitar URL do cliente e baixá-la no servidor é SSRF — permitiria fazer o servidor
buscar endereços internos. Restringir ao id numérico e a um host fixo elimina a classe inteira
de ataque.

### AD-8 — Comentário do desejado reaproveita `highlights`

**Decisão:** o campo de comentário na lista de desejados grava em `highlights` com
`kind='note'`, pelas rotas já existentes.

**Motivo:** a tabela, o RLS e as rotas de notas já existem e funcionam. Criar um campo separado
duplicaria conceito sem ganho.

## Modelo de dados

**Nenhuma coluna nova.** Todas as necessárias já existem em `books`:

| Coluna | Uso nesta spec |
|---|---|
| `read_status`, `my_rating` | Selo e estrelas (AD-1) |
| `image_url`, `thumbhash` | Capa de livro manual (AD-4, AD-6) |
| `average_rating`, `ratings_count` | Nota e votos da Open Library (AD-3) |

`average_rating` e `ratings_count` sobraram da era Goodreads e estão sem uso — passam a ser
preenchidas para livros manuais. `average_rating` é `decimal(3,2)`, compatível com a escala
0–5 da Open Library.

Mudanças nas queries:
- `fetchBooksWithPagination`: acrescenta `read_status` e `my_rating`.
- `fetchWishlist`: acrescenta `image_url`, `thumbhash`, `average_rating`, `ratings_count`.

## Componentes e fluxo

### Busca externa

`lib/openlibrary.ts` — módulo isolado, sem I/O de banco:

```ts
export interface ExternalBook {
  title: string;
  author: string | null;
  publicationYear: number | null;
  numPages: number | null;
  coverId: number | null;      // id da Open Library; a URL é montada no servidor (AD-7)
  ratingsAverage: number | null;
  ratingsCount: number | null;
}

export async function searchExternalBooks(query: string): Promise<ExternalBook[]>;
```

Consulta `openlibrary.org/search.json` com `limit=5` e os campos necessários, normaliza o
retorno e devolve no máximo 5. Timeout de 5 segundos via `AbortSignal.timeout`.

`GET /api/books/search-external?q=...` — autenticada; `q` vazio → 400; falha/timeout da Open
Library → 503 com mensagem em português. Não toca o banco.

### Aplicar capa e dados

`POST /api/books/[id]/cover` — dois modos, ambos restritos a `source='manual'` (AD-5) e dentro
de `withUser`:
- `{ coverId: number }` → servidor baixa de `covers.openlibrary.org` (AD-7) e chama
  `uploadCover`.
- `multipart/form-data` com um arquivo → valida tipo (`image/jpeg`, `image/png`, `image/webp`)
  e tamanho (máx. 5MB), depois `uploadCover`.

Em ambos, gera o `thumbhash` (como o import já faz) e grava `image_url`/`thumbhash`.

O `POST /api/books` existente ganha campos opcionais `averageRating` e `ratingsCount`, para o
livro nascer já com a nota quando vier da busca.

### Interface

- **`Photo`** ganha `readStatus?: string | null` e `myRating?: number | null`, desenhando selo
  e estrelas sobre a capa. Usado pelo grid do catálogo e pela lista de desejados.
- **Formulário de desejados** ganha o campo de busca com botão "Buscar", a lista de candidatos
  (capa, título, autor, ano, `nota ★ · N votos`) e o botão de escolher. O preenchimento manual
  continua disponível abaixo.
- **Item da lista** passa a mostrar capa, nota com votos, botão "Enviar capa" e um campo de
  comentário (AD-8).

## Tratamento de erros

- **Open Library fora do ar ou lenta:** timeout de 5s; a UI mostra "Não foi possível buscar
  agora — preencha manualmente" e o formulário manual continua utilizável. A busca **nunca**
  bloqueia a criação do livro.
- **Busca sem resultados:** mensagem explícita ("Nada encontrado — preencha manualmente"), não
  uma lista vazia silenciosa.
- **Resultado sem capa ou sem nota:** o candidato aparece assim mesmo, com placeholder e "sem
  avaliações". Informação parcial é melhor que resultado escondido.
- **Download da capa falha:** o livro é criado/preservado sem capa, com aviso. Falha de imagem
  nunca desfaz o resto (padrão herdado do sync).
- **Upload inválido:** 400 nomeando o motivo (tipo não suportado / arquivo acima de 5MB).
- **Capa em livro do Calibre:** 409 com a orientação de trocar no Calibre e sincronizar.
- Todas as rotas usam `errorResponse` (log estruturado + `requestId`, mensagem genérica).

## Testes

- **`searchExternalBooks`** com `fetch` mockado: normaliza os campos; resultado sem
  `ratings_average` vira `null` (não `0` — zero seria uma nota falsa); sem `cover_i` vira
  `null`; devolve no máximo 5; timeout rejeita.
- **`GET /api/books/search-external`:** `q` vazio → 400; falha da Open Library → 503; sucesso
  devolve os candidatos normalizados.
- **`POST /api/books/[id]/cover`:** livro `source='calibre'` → 409; tipo de arquivo inválido →
  400; arquivo acima de 5MB → 400; sucesso grava `image_url`/`thumbhash` em `withUser`; e
  **uma URL arbitrária no lugar do `coverId` é recusada** (prova do AD-7).
- **Queries:** `fetchBooksWithPagination` devolve `read_status`/`my_rating`; `fetchWishlist`
  devolve capa e nota.
- **`Photo`:** sem framework de teste de componente no repo — a verificação é typecheck + uso
  real, coerente com o padrão do projeto.
- CI (typecheck + lint + testes) permanece gate bloqueante.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Cobertura fraca da Open Library em livros em português | Upload manual (AD-6) como caminho garantido; a busca é enriquecimento, não requisito |
| Dependência de serviço externo gratuito | Timeout de 5s, degradação para preenchimento manual, e nenhum caminho crítico depende dela |
| SSRF ao baixar capa | Só `coverId` numérico; host fixo montado no servidor (AD-7); teste dedicado |
| Cota do Storage | ~50–100KB por capa contra 1GB; só livros manuais têm capa enviada pelo site |
| Nota da Open Library divergir de outras fontes | Exibida sempre com o número de votos (AD-3), que é o que permite julgar a confiabilidade |
