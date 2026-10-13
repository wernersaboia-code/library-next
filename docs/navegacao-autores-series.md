# Navegação por autores e séries — 13/10/2026

Continuação da [transição inspirada no Colibri](transicao-colibri-implementacao.md).

## Comportamento

- `/autores`: índice dos autores associados aos livros do usuário autenticado, com contagem e busca local por trecho sem acentos.
- `/autores/[id]`: livros daquele autor em ordem de título, mantendo todos os coautores na legenda. Um autor que só tem livros em outra conta retorna 404.
- `/series`: índice das séries presentes no catálogo. `/series?nome=...` abre seus volumes; a query preserva nomes com barras, `%`, `&`, acentos e outros símbolos.
- Os livros desejados também participam dos índices. As séries são agrupadas pelo nome existente, ignorando apenas espaços externos. Não há reconciliação automática de grafias ou associação a uma obra externa.
- Volumes são ordenados numericamente, incluindo frações; os sem índice aparecem ao final. Empates usam título e ID para que a paginação seja estável.
- Listas paginadas em 28 livros, com anterior/próxima e página atual. A ficha recebe a origem e retorna à mesma lista/página; aceita somente destinos locais de autores/séries.
- Links para autores usam os IDs efetivamente associados ao livro. A ficha também recebeu filtro explícito de proprietário, remoção de autores nulos e preferência por ISBN-13 na exibição.
- Atalhos na sidebar e no menu “Mais” do celular. O painel móvel tem altura limitada e rolagem própria para comportar todas as opções em telas baixas.

## Arquitetura

Consultas em `lib/db/catalog-browse.ts`, executadas por `withUser` e também filtradas por `books.user_id`. Índices agregam contagens, sem carregar arquivos ou duplicar livros por coautoria. A listagem de um autor usa subconsulta para selecionar seus livros e agrega todos os autores depois.

Os índices enviam somente nomes, IDs e contagens ao componente cliente; livros são consultados por página no servidor. Não há nova migration, dependência, alteração nos dados do Calibre ou nos registros de leitura.

## Verificação

- Sete testes novos no Postgres de teste: contagens, coautorias, desejados, caracteres literais e espaços em séries, ordem numérica/frações/nulos, paginação e isolamento entre duas contas, além dos IDs dos links na ficha.
- Dois testes de URLs: codificação dos nomes e bloqueio de destinos externos/rotas alheias no botão Voltar.
- Regressão: 13 testes de coleções e 11 de título original/séries passaram. Schemas temporários removidos ao final pelo helper.
- Regressão geral sem banco: 296 testes passaram em 39 suítes. Nesta continuação foram executados 327 testes distintos: 296 sem banco e 31 no Postgres de teste (os sete novos mais 24 de regressão).
- Build de produção passou com `/autores`, `/autores/[id]` e `/series`, incluindo lint e tipos. Avisos de `browserslist`/Serwist permanecem na dependência.
- Navegador com componentes reais, dados fictícios e navegação Next adaptada para links comuns: filtro `joao` encontra `João`, navegação de autor e série, paginação com manutenção do nome e atalhos no menu móvel. Verificado em largura de celular sem rolagem horizontal; em 390×480, o menu ocupa 408 px e permite rolar seu conteúdo de 528 px.
- O teste visual é isolado. Não comprova o serviço publicado nem substitui a validação no iPhone físico com a conta real.

## Limites

Variações de nome de autor ou série continuam sendo registros separados. Essa separação evita juntar pessoas ou séries homônimas sem revisão. Busca no conteúdo dos livros, reconciliação de autores e suporte a vários formatos por obra permanecem etapas distintas.

O commit e o push desta entrega foram autorizados em 13/10/2026. As verificações acima são anteriores à publicação e não comprovam, por si só, a disponibilidade da versão no site.
