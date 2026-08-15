# Book Inventory — Spec: Ajustes de leitura, Próximos e Favoritos

**Data:** 2026-08-14
**Status:** Aguardando revisão do dono
**Sucede:** painel e progresso de leitura (PR #9)

> As decisões desta spec são citadas como AD-1..AD-8. Comentários no código que
> se referirem a elas devem citar também a data da spec, porque as specs
> anteriores numeram as suas próprias decisões do mesmo jeito.

## Contexto

O rastreamento de leitura entrou em produção e o dono passou a usá-lo de fato,
pelo celular. Cinco observações vieram desse uso — quatro delas são coisas que a
spec anterior não previu, e uma é um defeito.

**O defeito.** Marcar um livro como "Abandonado" não pega. O livro continua
aparecendo como "Lendo", inclusive na faixa "Lendo agora" do catálogo, e a caixa
para escrever o motivo do abandono aparece por um instante e some. A causa está
em `app/api/books/[id]/route.ts:54`: qualquer progresso gravado entre 1% e 99%
força `read_status = 'lendo'`. Como a caixa de motivo só é renderizada quando o
status é "abandonado", ela desaparece no `router.refresh()` seguinte.

O dono descobriu sozinho o contorno — gravar o percentual **antes** de mudar o
status funciona — o que confirma o diagnóstico e revela o requisito real: ele
quer as duas coisas juntas. O percentual num livro abandonado não é ruído; é o
registro de **o quão perto ele chegou de terminar**.

**A nota fracionária.** Cinco níveis são grosseiros demais para separar os
livros que ele leu. Falta meia estrela.

**A pilha de cabeceira.** O acervo tem mais de mil livros e nenhum lugar que
responda "o que eu vou ler depois deste". As Bibliotecas existentes são
temáticas e curadas; Desejados é lista de compras. Nenhuma das duas é a fila.

**A lista curta.** Simétrica à anterior, mas do outro lado da leitura: os livros
que já foram lidos e superaram todas as expectativas. Cinco estrelas o dono dá a
muitos livros; favorito é outra coisa.

**A navegação do catálogo.** Para chegar à página 17 de 42, hoje o dono edita a
barra de endereços. Funciona e é constrangedor.

## Objetivo

Fazer o acervo refletir a verdade sobre a leitura — inclusive as leituras que
não terminaram — e dar às duas pontas da estante (o que vem depois, o que valeu
mais) um lugar próprio.

**Critério de sucesso:** o dono abandona um livro pelo celular em qualquer
ordem de operações, com o motivo escrito e o percentual preservado, e o livro
some da faixa "Lendo agora"; dá 3,5 estrelas a um livro com dois toques; marca
três livros como próximos e os encontra numa página só; vê seus favoritos
reunidos; e salta para a página 17 do catálogo sem tocar na barra de endereços.

## Não-objetivos

- **Redesign visual e reescrita do README** — ciclo próprio, logo depois deste.
  O README promete leitor EPUB, Google Drive, tradutor e PWA, todos removidos no
  commit `73fde48`.
- **Leitura de livros pelo celular** — projeto independente e o maior de todos.
  Depende de resolver acesso aos arquivos no Drive antes de qualquer interface.
- **Ordem explícita na fila de Próximos** (1º, 2º, 3º) — ver AD-5.
- **Filtros de Próximos e Favoritos no catálogo** — as páginas dedicadas
  resolvem; mais um filtro é peso sem retorno.
- **Importar a nota do Calibre para `my_rating`** — hoje ela vai para
  `average_rating`. Discutível, mas independente desta spec.
- **Reduzir o menu** — ele vai a cinco itens e fica no limite. Problema do ciclo
  do redesign.

## Decisões de arquitetura

### AD-1 — `my_rating` vira `real`, não inteiro em meios

A coluna passa de `integer` para `real`, aceitando múltiplos de 0,5 entre 0,5 e
5,0.

A alternativa clássica é guardar meias estrelas como inteiro (1..10, onde 7 =
3,5). Rejeitada: obriga todo leitor — badge da capa, página do livro, futuras
estatísticas — a dividir por 2, e um único ponto que esquecer a divisão mostra
"7 estrelas". Com `real`, o número gravado é o número exibido.

O risco usual de ponto flutuante não se aplica: 0,5 e seus múltiplos são
representáveis exatamente em binário.

A migração é só de tipo. Os valores 1..5 que já existem continuam válidos e com
o mesmo significado, então não há reescrita de dados. O filtro "Avaliação
Mínima" do catálogo não é afetado porque ele consulta `average_rating`
(`lib/db/queries.ts:25`), não `my_rating`.

### AD-2 — Meia estrela por toque repetido

Tocar a estrela N grava N. Tocar de novo **na mesma estrela** grava N − 0,5. Um
terceiro toque limpa a nota.

O padrão do Letterboxd — metade esquerda do ícone dá meia, metade direita dá
cheia — foi rejeitado porque o alvo fica em torno de 12px no celular, que é o
aparelho onde o dono usa o site. Aumentar os ícones resolveria o alvo e roubaria
espaço vertical numa tela já cheia.

O `aria-label` de cada estrela anuncia o efeito do **próximo** toque, não o
valor da estrela, porque o efeito depende da nota atual.

### AD-3 — Progresso só promove livro "não lido"

A regra do "lendo" automático passa a valer apenas quando o status atual é "não
lido". Livro abandonado ou lido mantém o status ao receber progresso.

Isso preserva a comodidade que a spec anterior buscava (começar um livro sem
mexer no seletor) e elimina o efeito que ela não previu: sobrescrever uma
decisão tomada de propósito.

O status atual precisa ser lido **dentro da mesma transação** do update, e não
recebido do cliente. O cliente pode estar mostrando um estado velho — foi
exatamente assim que o defeito se manifestou — e uma decisão de escrita baseada
no que a tela acha que sabe volta a errar sob concorrência ou rede lenta.

Consequência desejada e explícita: o percentual continua gravado e visível num
livro abandonado, indicando o quão perto o dono chegou.

### AD-4 — O motivo do abandono nasce junto do seletor de status

A caixa "Por que abandonou?" sai de `progress-controls.tsx` e passa para
`tracking-controls.tsx`, abrindo logo abaixo do seletor no momento em que
"Abandonado" é escolhido, com foco automático.

Hoje ela nasce longe, dentro do bloco de Progresso mais abaixo na página — parte
do motivo de o dono tê-la perdido de vista. Um diálogo modal foi considerado e
rejeitado: garante ser visto, mas interrompe o registro de um dado opcional.

O botão "Terminei hoje" deixa de ser renderizado quando o livro está abandonado.
Ali ele é ruído, e um clique acidental apagaria o abandono.

### AD-5 — Próximos é coluna no livro, não coleção

`books.next_up boolean not null default false`.

Modelar como uma coleção chamada "Próximos" reaproveitaria as tabelas
existentes, mas: marcar exigiria o fluxo de adicionar a uma coleção, a estante
ficaria misturada com as temáticas sem destaque, e nada impediria duas coleções
com o mesmo propósito. Uma coluna dá o toque único e torna o estado
irrepresentável em duplicidade.

Fila com ordem explícita foi rejeitada por YAGNI e por ergonomia: arrastar para
reordenar no celular é ruim, e o dono pediu uma etiqueta, não um ranking.

Por ser dado de leitura e não de catálogo, `next_up` fica fora de
`metadataValues` em `lib/db/calibre-sync.ts` e sobrevive a cada
`db:import-calibre`.

### AD-6 — Próximos exige posse, e se apaga ao virar "lido"

A API recusa marcar `next_up` num livro com `owned = false`, e a interface não
oferece o botão. Próximos é a pilha de cabeceira: o que dá para abrir hoje.
Desejados continua sendo a lista de compras. Misturar as duas faria a estante
responder "o que vou ler" com livros que precisam ser comprados antes.

Quando o status vira "lido", `next_up` é limpo na mesma escrita: o livro saiu da
fila e deixá-lo lá exigiria uma faxina manual que ninguém faz. Em "lendo" a
marca permanece, porque interromper e voltar é comum, e o livro já aparece na
faixa "Lendo agora" de qualquer forma.

### AD-7 — Favorito exige "lido", e nunca se apaga sozinho

`books.favorite boolean not null default false`, também fora do alcance do sync.

Só um livro com `read_status = 'lido'` pode ser marcado, validado na API e não
apenas na tela — foi como o dono descreveu a etiqueta ("Lido" e "Favorito"
juntas).

Ao contrário de `next_up`, `favorite` **não** é limpo por mudança de status. Se
o dono voltar um favorito para "lendo" numa releitura, a marca fica: favorito
não é posição numa fila, é um julgamento sobre o livro, e desfazê-lo tem de ser
deliberado.

Favorito é deliberadamente independente da nota. Derivá-lo de "5 estrelas"
destruiria justamente a distinção que o dono quer fazer — ele dá cinco estrelas
a vários livros muito bons; favorito é a lista curta dos que superaram tudo.

### AD-8 — Salto de página como formulário nativo, com clamp

O texto "página 3 de 42" na paginação vira um campo numérico com submit, no
mesmo padrão `next/form` que já move as setas
(`components/book-pagination.tsx`). Assim busca e filtros são preservados pelos
mesmos inputs escondidos, e funciona sem JavaScript.

Um valor fora da faixa é limitado ao intervalo válido em vez de gerar erro:
pedir a página 99 de 42 leva à última, que é o que a pessoa queria. O clamp fica
no servidor, porque a URL é editável à mão.

## Superfície da mudança

### Banco — migração `0012`

| Mudança | Tabela |
|---|---|
| `my_rating`: `integer` → `real` | `books` |
| `next_up boolean not null default false` | `books` |
| `favorite boolean not null default false` | `books` |
| Índice parcial em `(user_id) where next_up` | `books` |
| Índice parcial em `(user_id) where favorite` | `books` |

Os índices são parciais porque as duas listas são pequenas por natureza — dezenas
de linhas num acervo de mais de mil.

As políticas RLS existentes cobrem as colunas novas: elas filtram por `user_id`
na linha, não por coluna.

### Servidor

- `app/api/books/[id]/route.ts` — validação de `myRating` em passos de 0,5;
  leitura do status atual na transação (AD-3); `nextUp` e `favorite` com suas
  regras de posse e de status; limpeza de `next_up` ao virar "lido".
- `lib/db/queries.ts` — consultas das duas listas novas.
- `lib/db/schema.ts` — colunas e tipos.
- `lib/db/calibre-sync.ts` — conferir (e fixar em teste) que as colunas novas
  não entram em `metadataValues`.

### Interface

- `app/(main)/[id]/tracking-controls.tsx` — estrelas com meio passo; caixa de
  motivo do abandono; botões de Próximo e Favorito.
- `app/(main)/[id]/progress-controls.tsx` — remoção da caixa de motivo; "Terminei
  hoje" escondido em livro abandonado.
- `components/cover-badges.tsx` — meia estrela desenhada por recorte; marcador
  (`bookmark`, índigo) para Próximos e coração (rosa) para Favoritos, no canto
  superior direito, empilhando se ambos valerem.
- `components/book-pagination.tsx` — campo de salto.
- `app/(main)/proximos/` e `app/(main)/favoritos/` — páginas novas, no padrão de
  `desejados/`.
- `components/nav-bar.tsx` — dois itens novos.
- Modo de multi-seleção do catálogo — marcar vários como próximos de uma vez,
  reaproveitando o fluxo que já existe para as Bibliotecas.

## Testes

Regressões que fixam o defeito e as regras novas:

- abandonado + progresso 50 → continua abandonado, com o percentual gravado
- não lido + progresso 50 → vira lendo
- lido + progresso 50 → continua lido
- livro abandonado não aparece na consulta de "Lendo agora"
- nota 3,5 sobrevive à ida e volta pela API; 3,7 é recusada
- `next_up` recusado em livro com `owned = false`
- `next_up` limpo quando o status vira "lido"
- `favorite` recusado em livro que não está "lido"
- `favorite` sobrevive à mudança de status para "lendo"
- `db:import-calibre` não altera `next_up` nem `favorite`
- salto para página 99 de 42 devolve a página 42, preservando busca e filtros

## Ordem de aplicação para o dono

Quando esta mudança for para produção, os dois comandos são necessários e nesta
ordem, conforme `docs/atualizar-acervo.md`:

```bash
pnpm db:migrate
pnpm db:import-calibre --email=wernersaboia@gmail.com --path="G:\Meu Drive\Livros"
```

A migração vem primeiro porque a importação escreve em colunas que ela cria.
