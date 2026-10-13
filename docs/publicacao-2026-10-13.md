# Publicação da transição — 13/10/2026

O commit `489cc5d` reúne o layout, a importação/revisão de metadados, as correções de OPDS e a navegação por autores/séries. Foi enviado a `main` com autorização explícita e publicado com sucesso pela Vercel (deployment GitHub `7041825810`). A validação física no Safari do iPhone continua a confirmar.

## Instalação reproduzível e CI

O CI ainda usava pnpm 9, enquanto a instalação local usava pnpm 11.21.0. O commit `3f44da3` fixou essa versão no projeto e no Actions e declarou o pacote raiz no workspace. A instalação limpa também revelou módulos com scripts sem política explícita; a configuração agora permite o resolver nativo de lint e recusa os módulos opcionais de SQLite e aceleração de WebSocket, dispensáveis neste aplicativo com Postgres.

Foram aplicadas as correções publicadas de Next 15, Sharp, browserslist, brace-expansion, source-map-js e postcss-selector-parser, preservando o lockfile. A auditoria continua obrigatória e fica após os testes, permitindo executar os checks funcionais mesmo quando uma dependência externa ainda impede a aprovação de segurança.

## Pendência externa

O [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) afeta `braces` até 3.0.3. A auditoria npm indica 3.0.4, mas essa versão não está publicada no registro consultado; o aviso oficial do GitHub informa que não há versão corrigida. Não foi acrescentada exceção à auditoria nem substituído o parser por um pacote de comportamento diferente. Atualizar assim que houver correção publicada e repetir os testes.

Após as atualizações, os 296 testes sem banco passaram novamente (39 suítes). O build final de produção passou com lint, tipos e geração de páginas; permanece o aviso de `require` dinâmico em browserslist/Serwist. A instância de Sharp resolvida pelo Next gerou uma imagem WebP corretamente. As verificações anteriores de consultas em Postgres e os detalhes de implementação estão em [transicao-colibri-implementacao.md](transicao-colibri-implementacao.md) e [navegacao-autores-series.md](navegacao-autores-series.md). Nenhuma migration foi aplicada ao acervo de produção durante a publicação.
