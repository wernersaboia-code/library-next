# Book Inventory — Spec: organizar o "Quero ter" e destravar a capa automática

**Data:** 2026-08-19
**Status:** Aprovado para planejamento
**Sucede:** a página Leituras e as correções de busca

## Contexto

A lista de desejados tem 26 livros e cresce rápido — o dono está cadastrando muitos. Ele
descreveu o problema como *"essa lista infinita está causando problemas"*: um `<ul>` contínuo,
sem ordem previsível (hoje ordena por `created_at`), sem como filtrar, e com o formulário de
cadastro ocupando a primeira tela inteira antes do primeiro livro aparecer.

O formato do cartão **não** é o problema: perguntado, o dono disse que ter nota e o botão de
apagar visíveis no mesmo lugar "está ótimo". Também descartou ordenar por nota — a maioria dos
livros tem poucos ou nenhum voto, o que torna a ordem arbitrária. Pediu ordem alfabética.

Sobre a capa, o dono relatou que não baixa sozinha e que não quer subir imagem à mão em cada
livro; disse que preferiria remover a função a conviver com um espaço vazio — **mas que, se
fosse possível baixar de verdade, tudo bem**.

### A capa: medição, não suposição

Os dados descartaram um bug de lógica. No banco: **0 de 26** livros com capa. Desses 26, 19
foram cadastrados à mão (nunca teriam capa — é o esperado) e **7 vieram da busca externa e
ficaram sem**, embora a Open Library tenha capa para todos eles (verificado: Penpal, Slade
House, The Ruins, The Taking, I Remember You).

Cada peça do encadeamento foi testada isoladamente e **todas funcionam**: a busca devolve
`cover_i`, o download traz um JPEG válido, `sharp` gera o thumbhash, o upload ao Supabase
Storage grava, e o botão "Escolher" chama a rota certa. Chamada autenticada à rota real
`POST /api/books/2995/cover` devolveu **200** e gravou a capa.

O que falha é **tempo**:

| Chamada | Timeout no código | Latência medida |
|---|---|---|
| `searchExternalBooks` (`lib/openlibrary.ts`) | 5 000 ms | mediana **7 221 ms**; 3 de 5 acima de 5 s; 1 de 6 falhou de vez |
| `fetchOpenLibraryCover` (`lib/covers.ts`) | 10 000 ms | rota completa em **11 741 ms** |

A Open Library responde devagar desta rede. Os timeouts foram calibrados otimistas demais, o
que produz os dois sintomas relatados: busca que "às vezes não funciona" (503, que a interface
traduz como "Não foi possível buscar agora. Preencha manualmente.") e capa que nunca chega
(a interface apenas avisa "Livro adicionado, mas a capa não pôde ser baixada").

## Objetivo

Tornar a lista de desejados navegável quando tiver dezenas de livros, e fazer a capa chegar
sozinha ao escolher um resultado da busca.

**Critério de sucesso:** com a lista cheia, o dono acha um título específico sem rolar a
página inteira, e sabe onde está enquanto rola. Ao adicionar um livro pela busca, a capa
aparece sem nenhuma ação extra.

## Não-objetivos

- **Trocar o cartão por grade de capas.** Sugerido e recusado: o formato atual, com nota e
  botão de apagar visíveis, é o que o dono quer.
- **Ordenar por nota.** Recusado pelo dono — poucos votos tornam a ordem arbitrária.
- **Paginação.** O objetivo é escanear a lista à procura do que comprar; quebrar em páginas
  atrapalha esse uso. O filtro (AD-2) resolve o mesmo problema sem esconder nada.
- **Remover o envio manual de capa.** Continua como rede de segurança para livros que a Open
  Library não cobre — o caso dos 19 cadastrados à mão.
- **Deduplicar a lista.** O acervo tem "I remember you" duplicado; apagar é um clique e o
  filtro (AD-2) torna a duplicata visível. Automatizar isso é outro assunto.
- **Nova coluna, migração ou rota de API.**

## Decisões de arquitetura

### AD-1 — Timeouts calibrados pela latência medida, não pelo otimismo

**Decisão:** `TIMEOUT_MS` em `lib/openlibrary.ts` passa de 5 000 para **15 000 ms**;
o timeout de `fetchOpenLibraryCover` em `lib/covers.ts` passa de 10 000 para **20 000 ms**.
Ambos ganham um comentário registrando a medição que justifica o número.

**Motivo:** 15 s é ~2× a mediana medida (7,2 s) e cobre a pior amostra (8,9 s) com folga; 20 s
é ~1,7× a chamada completa de capa observada (11,7 s). Números escolhidos com margem para
variação de rede, não colados no que foi medido.

**Por que não é só aumentar até funcionar:** o timeout existe para a busca externa nunca
travar o cadastro. A degradação continua a mesma — falhou, a interface diz para preencher à
mão, e o formulário manual segue utilizável. O que muda é o limiar deixar de disparar no uso
normal.

**Consequência aceita:** a espera de uma busca lenta agora pode chegar a 15 s em vez de falhar
em 5 s. É melhor que o estado atual — hoje ela falha e o dono preenche tudo à mão, o que
demora mais que 15 s. O spinner que já existe (`buscando`) cobre a espera.

### AD-2 — Filtro no cliente, sobre a lista já carregada

**Decisão:** um campo de texto acima da lista filtra por título e autor, sem acento e sem
distinguir maiúsculas, na lista que o servidor já mandou. Sem ida ao servidor, sem query
nova, sem parâmetro de URL.

**Motivo:** a lista inteira já vem numa resposta só (`fetchWishlist` não pagina). Filtrar no
cliente é instantâneo e não acrescenta rota nem estado de URL. A escala justifica: dezenas de
livros, não milhares.

Vale mais que qualquer outra medida no uso real descrito pelo dono — cadastrando muitos livros,
a pergunta constante é "será que já coloquei esse?", e três letras respondem na hora.

O contador do cabeçalho passa a mostrar o recorte quando o filtro está ativo ("3 de 26"), para
o número nunca contradizer o que está na tela.

### AD-3 — Ordem alfabética com divisórias de letra

**Decisão:** `fetchWishlist` passa a ordenar por título (hoje: `createdAt`). A lista ganha
divisórias com a letra inicial, fixas no topo enquanto a seção rola (`position: sticky`).
Livros cujo título não começa com letra (números, símbolos) caem numa seção `#`.

**Motivo:** ordem alfabética foi o pedido explícito. As divisórias são o que transforma a
"lista infinita" em algo com marcos — sem elas, ordenar alfabeticamente melhora a busca mental
mas a página continua um borrão contínuo ao rolar.

**A ordenação é feita só no Postgres; o cliente apenas agrupa a lista já ordenada.** Isso evita
duas ordens que possam divergir, e dispensa `localeCompare` no cliente: medido contra o banco
real, a collation `en_US.UTF-8` já ordena acento corretamente
(`Alien | Ártico | Echo | Ícaro | Zumbi` — o "Á" cai logo depois do "A", não no fim).

Pelo mesmo motivo a seção `#` fica **no começo**, não no fim: é onde o Postgres põe títulos
iniciados por número (`100 anos` antes de `Alien`). Mover essa seção para o fim exigiria
reordenar no cliente, contrariando a decisão acima por um ganho estético pequeno.

### AD-4 — Formulário de cadastro recolhido por padrão

**Decisão:** o bloco de busca externa + formulário manual passa a ficar dentro de um
`<details>` fechado, com um resumo clicável ("Adicionar livro"). Abre no clique e permanece
aberto durante a sessão de cadastro.

**Motivo:** hoje ele ocupa a primeira tela inteira; o primeiro livro da lista só aparece
depois de rolar. Quem chega à página na maioria das vezes quer **ver** a lista, não cadastrar.

`<details>` nativo em vez de estado React: é um toggle de conteúdo estático, acessível por
padrão (teclado, leitor de tela) e não exige mais um `useState` num componente que já tem
doze.

## Modelo de dados

**Nenhuma mudança.** Só a cláusula `ORDER BY` de `fetchWishlist` muda (AD-3).

## Componentes e arquivos afetados

| Arquivo | Mudança |
|---|---|
| `lib/openlibrary.ts` | `TIMEOUT_MS` 5 000 → 15 000, com comentário da medição (AD-1) |
| `lib/covers.ts` | timeout de `fetchOpenLibraryCover` 10 000 → 20 000 (AD-1) |
| `lib/db/queries.ts` | `fetchWishlist` ordena por título (AD-3) |
| `app/(main)/desejados/wishlist-client.tsx` | Filtro (AD-2), divisórias de letra (AD-3), formulário recolhido (AD-4) |
| `test/db/wishlist.test.ts` | Cobre a nova ordenação (AD-3) |
| `test/openlibrary.test.ts` | Já existe; confirmar que nada nele fixa o valor 5 000 ms |

`components/photo.tsx` e `components/empty-state.tsx` são reusados sem alteração.

## Interface

O cabeçalho e o `<details>` de cadastro ficam no topo. Abaixo, o campo de filtro, depois a
lista em seções por letra.

- Filtro vazio: lista completa, contador "26 livros".
- Filtro ativo com resultado: só o que casa, contador "3 de 26 livros", seções recalculadas.
- Filtro ativo sem resultado: mensagem dizendo que nada casou e oferecendo limpar o filtro —
  **não** o `EmptyState` de lista vazia, que diria a coisa errada (a lista não está vazia).
- Lista genuinamente vazia: o `EmptyState` atual, inalterado.

## Tratamento de erros

Nenhum caminho de erro novo. Os existentes seguem: busca externa que falha cai na mensagem de
preencher manualmente; capa que falha avisa sem desfazer o livro. AD-1 só desloca o limiar que
dispara esses caminhos.

## Testes

- **`fetchWishlist`:** ordena por título e não por data de cadastro; acento não desloca o item
  para o fim (prova do `localeCompare`/collation); segue trazendo só `source='manual'` e
  `owned=false`.
- **Interface** (sem framework de teste de componente no repo — convenção registrada desde as
  specs de 2026-08-14): typecheck, lint e uso real no navegador, cobrindo: filtro reduz a
  lista e o contador acompanha; filtro sem resultado mostra a mensagem própria e não o estado
  vazio; divisórias aparecem e grudam ao rolar; `<details>` abre e fecha; a lista aparece sem
  precisar rolar com o formulário fechado.
- **Capa de ponta a ponta:** adicionar um livro pela busca e confirmar que a capa aparece
  sozinha — a prova do AD-1, e o cenário que falhava antes.
- CI (typecheck + lint + testes) permanece gate bloqueante.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| 15 s ainda ser pouco num dia ruim da Open Library | A degradação já existe e é suave: mensagem clara + formulário manual. O número está registrado com a medição que o justifica, então recalibrar depois é uma decisão informada |
| Busca lenta parecer travada durante 15 s | O spinner `buscando` já existe e cobre a espera |
| Filtro no cliente não escalar se a lista crescer muito | A ~26 livros e crescendo aos poucos, está longe disso; quando incomodar, a saída é paginar no servidor, e o filtro vira parâmetro de URL |
| Ordem do cliente divergir da do banco | A ordenação é feita **só** no Postgres; o cliente apenas agrupa a lista já ordenada, então não há duas ordens para divergirem |
| **A Vercel corta a função antes do nosso timeout de 20 s.** O plano do dono é Hobby, com teto fixo de 10 s por função serverless, que nenhum `AbortSignal.timeout` do nosso código consegue estender. A medição de 11 741 ms para a rota de capa foi feita em `next dev` local, que soma um custo de compilação na primeira chamada inexistente em produção (já compilada) — o tempo real em produção é desconhecido até medir lá | Aceito conscientemente (decisão do dono): o pior caso é idêntico ao bug original — a capa falha e o aviso "Livro adicionado, mas a capa não pôde ser baixada" aparece — não uma regressão nova. O envio manual de capa já existe como rede de segurança. Se a Vercel seguir cortando com frequência depois do merge, a correção passa a ser tirar o download do ciclo da requisição (ex.: o navegador baixar e enviar direto ao Storage), não aumentar timeout — mas só vale investir nisso se a medição real confirmar o problema |
