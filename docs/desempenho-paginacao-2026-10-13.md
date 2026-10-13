# Paginação do catálogo — 13/10/2026

Werner relatou demora ao trocar a página pelo rodapé no notebook. A investigação ficou concentrada nesse fluxo, antes de uma revisão geral.

## Achados e correções

- A grade usava `prefetch={true}` em todas as capas. Isso inclui os dados dinâmicos da ficha mesmo sem abrir o livro. Agora mantém o pré-carregamento automático da estrutura/loading do Next e busca os dados completos quando há hover ou foco do teclado.
- As setas eram formulários com `action="/"`; o pré-carregamento do Form considera o action, não a página formada pelos campos. Agora são links com o destino completo (página, busca e filtros), pré-carregando as páginas adjacentes.
- A marca interna de pendência existia, mas a animação da grade dependia de um ancestral `.group` ausente. Esse ancestral foi corrigido. A paginação também mostra um estado explícito com spinner e “Carregando página…”, usando a transição do router e impedindo novos comandos enquanto navega.
- O campo de página é recriado quando a página atual muda, evitando manter um valor editado anteriormente depois de usar uma seta. O formulário de salto continua funcionando como GET sem JavaScript. Parâmetros indefinidos são omitidos e o destino preserva filtros e caracteres especiais.

## Evidência

Uma aplicação Next 15.5.27 em modo de produção importou os componentes reais de grade/paginação. Usou 28 livros fictícios por página, três páginas e atraso artificial de 700 ms no servidor, sem banco, autenticação ou acesso ao acervo. A primeira tentativa dentro de `node_modules` não compilou TSX; a reprodução foi executada em diretório temporário separado, com dependências locais.

Na abertura em 1280 × 720, a versão anterior executou 18 renders completos de fichas de livros sem abrir nenhum deles; após a correção, nenhum render completo de ficha foi executado nessa mesma abertura. Pré-carregamentos parciais de estrutura/loading continuam existindo. A página adjacente foi buscada antes do clique, e uma navegação fria pelo campo “Ir” mostrou imediatamente pendência, controles bloqueados e animação da grade. Ao concluir, o aviso desapareceu e os controles voltaram a funcionar. Navegação anterior, número do campo após edição e preservação de `search=ficção&bib=8` também foram confirmados.

Build de produção do projeto aprovado, incluindo tipos e lint. Os 16 testes de paginação/estado de URL passaram, incluindo cinco novos casos de preservação/validação do destino. Captura da reprodução isolada em `paginacao-validacao.jpg` no diretório de visualizações da sessão. O servidor de teste deve ser encerrado após a verificação.

Esses resultados comprovam a redução do trabalho desnecessário e a resposta visual. Não medem o tempo de Vercel, Supabase ou rede no notebook do usuário e não garantem eliminar toda a demora relatada.

## Próxima revisão recomendada

Medir a navegação autenticada em produção e separar o tempo de autenticação, consultas e imagens. O middleware e os Server Components validam o usuário; a página também aguarda estatísticas/“Lendo agora” em cada paginação. São próximos candidatos para medição. A revisão deve preservar a validação da sessão, o isolamento por usuário e a atualização das estatísticas após alterações. Não foi removida autenticação nem introduzido cache compartilhado de dados pessoais nesta correção.
