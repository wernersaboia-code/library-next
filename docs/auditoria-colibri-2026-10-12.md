# Comparação com o Colibri — 12/10/2026

## Parecer

> Registro da auditoria inicial. As correções e os recursos implementados após a aprovação da sequência estão em [transicao-colibri-implementacao.md](transicao-colibri-implementacao.md), com os resultados atuais dos testes e as pendências.

A adaptação tem uma base coerente, mas ainda precisa de correções antes de ser considerada validada. O maior ganho adicional está na importação de arquivos com extração de metadados, identificação de duplicados e revisão dos dados encontrados.

O Book Inventory usa Next.js/React e Drizzle; o Colibri usa SvelteKit e um SDK com Kysely. Vale adaptar recursos pontuais à arquitetura atual. A adoção integral do SDK ou da interface exigiria mudanças muito maiores no banco, autenticação e componentes.

## Escopo e limites

- Revisão da árvore de trabalho atual, incluindo alterações ainda não commitadas, em comparação com o código disponível em `C:\1.Arquivos Gerais\Fonte de Inspiração - Ebook Library\colibri-main`.
- Referência do último commit local: `ca15b95`, anterior às alterações desta transição.
- Leitura das implementações, diferenças de Git, testes e documentação; reprodução isolada de problemas de metadados e OPDS, executando as funções do projeto com dependências simuladas.
- Nenhum acesso ao conteúdo de arquivos `.env*`, nenhuma alteração no banco, nenhum upload real e nenhuma publicação.
- Não houve teste visual no navegador, no iPhone ou em um cliente OPDS real. Aspectos de interface classificados abaixo como coerentes foram avaliados pelo código.
- Na etapa inicial, a única entrega persistente foi este relatório. A implementação posterior está descrita no documento vinculado acima.

## O que já foi incorporado

| Frente | Situação observada | Avaliação |
| --- | --- | --- |
| Navegação lateral e cabeçalhos | `components/sidebar.tsx`, `components/page-header.tsx` e layout principal | Integração coerente. Reutiliza rotas e listas de navegação existentes, mostra bibliotecas e preserva navegação móvel. Falta validação visual. |
| Aparência do Colibri | Titillium Web, Neuton, cores, disposição da grade, sombras e lombadas das capas | Adaptação identificável no código. Não depende de migrar para Svelte. |
| Capas geradas | `components/photo.tsx` | Funciona quando a URL está ausente; falta tratar falha ao carregar uma URL existente. |
| Arrastar livro para uma biblioteca | Grade → payload → sidebar → API de coleções | Fluxo coerente no código, com validação de identificador, mensagens de resultado e atualização da página. É uma interação de desktop; o seletor de coleções continua disponível como alternativa. Sem teste real do gesto. |
| Metadados de três fontes | Open Library, Google Books e Wikidata, via `/api/books/metadata` | Estrutura modular e consultas paralelas com isolamento de falhas. A junção e a persistência ainda estão incompletas. |
| Capas externas por referência | Provedor + identificador, com host montado no servidor | Boa integração com a rota existente. Mantém a restrição a livros manuais e o limite de frequência. Testes focados passaram. |
| Catálogo OPDS | Navegação, coleções, busca e downloads via URL assinada | Implementação substancial, porém com erro reproduzido de paginação e pontos de autenticação/isolamento a revisar. |

## Achados que exigem correção

### 1. Metadados encontrados são descartados no cadastro — prioridade alta

**Locais:** `app/(main)/desejados/wishlist-client.tsx:162` e `app/api/books/route.ts:62`.

O candidato contém `isbn13`, `language` e `description`, mas a seleção envia apenas título, autores, ano, páginas, editora e avaliações. A API de criação também não grava aqueles três campos. Assim, uma busca pode mostrar uma sinopse e um ISBN e o livro ser salvo sem ambos.

**Correção sugerida:** completar o contrato entre candidato, formulário e API; validar os campos e gravar ISBN, idioma e sinopse nas colunas existentes. Normalizar os códigos de idioma usados pelas fontes e pelo catálogo. Verificar o resultado lendo novamente o livro salvo.

### 2. O agregador não reúne candidatos quando apenas uma fonte fornece ISBN — prioridade alta

**Locais:** `lib/metadata/aggregate.ts:43`, `lib/metadata/providers/openlibrary.ts:19` e `lib/openlibrary.ts:3`.

A chave de agrupamento usa ISBN quando presente e título + primeiro autor quando ausente. São grupos independentes. Além disso, o adaptador da Open Library sempre informa `isbn13: null` e a consulta antiga nem solicita ISBN.

**Reprodução:** dois registros de “Duna”, de Frank Herbert, um sem ISBN e outro com `9780441013593`, produziram **dois candidatos**, sem complementar os campos entre eles.

**Correção sugerida:** buscar identificadores e informações de edição na Open Library e introduzir associação conservadora entre candidatos. Título e autor iguais, sozinhos, não justificam misturar edições com idiomas, páginas ou ISBNs distintos. Oferecer revisão quando houver ambiguidade.

### 3. Fontes em desacordo aumentam a confiança — prioridade média

**Locais:** `lib/metadata/aggregate.ts:19` e `lib/metadata/aggregate.ts:48`.

`escolher` lista todas as fontes que preencheram um campo, mesmo quando seus valores diferem. `confiancaDe` interpreta essa lista como concordância e aumenta a pontuação. A atribuição por campo também não identifica com precisão quem forneceu o valor vencedor.

**Reprodução:** mesmo ISBN, mesmo título e autor, anos **1965** e **2020**, confianças de origem 0,80 e 0,85. Resultado: ano **2020**, confiança **0,99** e ambas as fontes atribuídas ao ano. A pontuação não aparece atualmente no cartão, mas já participa da ordenação e torna o contrato do agregador enganoso.

**Correção sugerida:** distinguir fontes consultadas, fonte do valor escolhido, concordância real e conflitos. Comparar valores normalizados antes de conceder bônus de confiança.

### 4. OPDS perde a busca ao trocar de página — prioridade alta

**Locais:** `lib/opds.ts:411`, `lib/opds.ts:460` e `app/opds/search/route.ts:12`.

Os links de próxima/anterior são reconstruídos somente com `start` e `count`. O parâmetro `q` desaparece.

**Reprodução:** feed solicitado em `/opds/search?q=Duna`, com 50 resultados simulados, gerou link para `/opds/search?start=50&count=50`. Ao segui-lo, a rota recebe busca vazia e passa a paginar o acervo inteiro.

**Correção sugerida:** partir da URL atual, conservar seus parâmetros e substituir apenas os de paginação. Testar tanto próxima quanto anterior.

### 5. Autenticação OPDS não está vinculada ao dono — prioridade condicionada ao uso com outras contas

**Local:** `lib/opds.ts:88`.

O README descreve usuário igual ao `OWNER_EMAIL`, mas a implementação aceita qualquer e-mail existente em `app_users` acompanhado da senha global `OPDS_PASSWORD`. Não há comparação com `OWNER_EMAIL` nem limite de tentativas nesta autenticação.

Também faltam filtros explícitos de proprietário nas consultas de livros e arquivos do OPDS: elas dependem da RLS. A documentação existente (`docs/ativar-rls.md:3`) registra uma pendência de conexão com papel que ignora RLS. **O estado atual do banco não foi verificado nesta revisão.** Definir `app.user_id` em `withUser` não ativa RLS se a conexão tiver `BYPASSRLS`.

**Correção sugerida:** para este acervo de dono único, restringir o login OPDS ao dono e limitar tentativas; confirmar a conexão com papel sem bypass e testar acesso a um livro de outra conta. Se houver intenção futura de múltiplos usuários, usar credenciais OPDS individuais. É uma dependência de segurança preexistente que também afeta a nova funcionalidade.

### 6. Capa gerada não cobre erro de imagem — prioridade média

**Local:** `components/photo.tsx:113`.

A capa alternativa aparece somente quando `src` é vazio. Se a URL existir, mas responder 404 ou falhar, o componente permanece no ramo de imagem, sem `onError`. No Colibri, `BookCover.svelte` trata esse caso com `missingCover` e `handleFileError`.

**Correção sugerida:** alternar para a capa gerada em caso de erro e reiniciar o estado quando a URL mudar. Validar com imagem ausente e URL quebrada.

### Outros ajustes menores

- `lib/metadata/util.ts:2`: o ISBN é aceito pelo comprimento, sem validação do dígito verificador. `1111111111111` foi aceito como ISBN-13. Validar antes de usar como identidade de agrupamento.
- `lib/opds.ts:389`: `count=1.5` permanece fracionário; normalizar para inteiro antes de enviar como limite ao banco.
- `lib/opds.ts:332`: toda entrada de navegação anuncia um feed de aquisição, inclusive o link para `/opds/bibliotecas`, que retorna navegação. Permitir definir o tipo do destino.
- `lib/opds.ts:194`: a data Atom `updated` usa a criação do livro; mudanças posteriores nos metadados não atualizam esse valor.
- `app/(main)/desejados/wishlist-client.tsx:312`: o rótulo continua “Buscar na Open Library”, embora agora consulte três fontes; falhas parciais retornadas pela API também não são apresentadas.
- `README.md:7`: a introdução ainda afirma que o projeto não é um leitor, contrariando a implementação atual.

## O que mais aproveitar do código existente no Colibri

| Ordem | Recurso | Base existente no Colibri | Aplicação no Book Inventory | Esforço relativo |
| --- | --- | --- | --- | --- |
| 1 | Extrair metadados e capa do arquivo | `packages/sdk/src/ebooks/epub.ts`, `pdf.ts` e `metadata.ts` | Selecionar EPUB/PDF no celular, preencher o cadastro e revisar antes de salvar. Hoje o envio de arquivo depende de um livro já cadastrado. | Médio |
| 2 | Detectar duplicados | `packages/sdk/src/ingestion/detect-duplicates.ts` | Identificar arquivo repetido por SHA-256 e candidatos por ISBN/título/autor, antes de criar outro livro. O banco atual já guarda SHA-256 de arquivos. | Médio |
| 3 | Revisar enriquecimento e conflitos | `packages/sdk/src/metadata/reconciliation/preview.ts`, `conflicts.ts`, `identifiers.ts` | Mostrar valor atual e sugerido, fonte e divergências; permitir escolher o que aplicar. Preservar dados de leitura e respeitar a autoridade do Calibre sobre seu catálogo. | Médio |
| 4 | Cache e controle das consultas externas | `packages/sdk/src/metadata/providers/cacheable-provider.ts`, `retryable-provider.ts` | Evitar repetir buscas, estabelecer prazo total e usar tentativas limitadas por fonte. Adaptar ao tempo disponível nas funções da Vercel. | Baixo a médio |
| 5 | Organização por autor e série | Rotas de `creators`, `publishers` e reconciliação de séries | Navegação dedicada por autor/série, aproveitando relações e campos já presentes no banco. Editora pode ficar para uma segunda etapa. | Médio |
| 6 | Busca no conteúdo dos livros | `packages/sdk/src/ebooks/extract-text.ts` | Extrair texto de EPUB/PDF e localizar trechos, além da busca atual no catálogo. Exige indexação e tratamento separado de PDFs sem camada de texto. | Médio a alto |
| 7 | Vários arquivos/edições por obra | Recursos `work`, `edition` e `asset` | Manter EPUB e PDF, ou traduções, sob uma mesma obra. O modelo atual de `book_files` é de um arquivo por livro; precisa de evolução do schema e das rotas. | Alto |

As classes do SDK são referências de implementação. Não são componentes que se encaixam diretamente no projeto atual: há dependências internas, tipos de banco e convenções diferentes. Importação e enriquecimento também devem preservar a distinção atual entre catálogo do Calibre e dados pessoais de leitura.

O `package.json` do Colibri declara `AGPL-3.0-or-later`. Registrar origem e licença dos trechos reaproveitados faz parte da integração.

## Recursos que não devem ser tratados como prontos

Na cópia inspecionada, os planos `opds-feed.md`, `local-first-sync.md`, `recommender-system.md` e `reading-statistics.md` indicam implementação pendente. `ebook-reader.md` descreve leitor parcialmente implementado, com interface pendente; o carregamento MOBI ainda contém um TODO explícito.

Portanto, não há fundamento para prometer importação direta de um sistema pronto de recomendações, sincronização offline, painel de leitura ou leitor MOBI. O Book Inventory já tem leitor EPUB/PDF, acompanhamento, destaques e offline que devem ser preservados.

Passkeys, OAuth completo, moderação e recursos sociais ampliariam bastante o escopo de um catálogo pessoal. Têm prioridade inferior à correção e conclusão dos fluxos acima.

## Verificação executada

- **ESLint:** passou, sem erros ou avisos.
- **Testes focados:** 14 testes passaram em `test/metadata-aggregate.test.ts`, `test/covers.test.ts` e `test/api/cover.test.ts`.
- **Testes sem banco:** **258 testes passaram em 30 suítes**, em 73,61 segundos. Foram selecionadas as suítes que não chamam `createTestDb`/`requireTestDatabaseUrl`; as suítes de banco ficaram fora da execução. Os 14 testes focados acima fazem parte destes 258, não são adicionais.
- **TypeScript:** não passou. Houve erros de propriedades de componentes Radix (`children`, `className`) e tipos do Supabase (`getUser`), além de parâmetros inferidos como `any`. A causa exata e sua relação com instalação/resolução das dependências ainda precisam de diagnóstico; não atribuir todos esses erros à transição.
- **Execução:** o comando `pnpm` tentou consultar o registro npm pelo Corepack e falhou por DNS. Foram usados os executáveis já instalados em `node_modules/.bin`.
- **Ambiente dos testes:** a primeira execução abortou antes de coletar testes por `EPERM` ao renomear cache na pasta temporária. Redirecionar `TEMP`/`TMP`, somente para o processo de teste, a `node_modules/.cache/colibri-audit-tmp` permitiu executar tanto os testes focados quanto as 30 suítes sem banco.
- **Não executados:** testes de integração com banco, build de produção, consultas reais às fontes, upload real, validação visual e compatibilidade em clientes OPDS. A revisão não comprova o estado do serviço publicado.

Os três testes atuais do agregador cobrem ISBN igual, ausência de ISBN em ambos os registros e livros diferentes. Não cobrem os casos problemáticos reproduzidos. Não foram encontrados testes dedicados ao OPDS ou à nova rota de metadados.

## Sequência proposta

1. Resolver o bloqueio da verificação de tipos e estabelecer uma execução repetível dos testes.
2. Corrigir persistência e junção de metadados, atribuição de fontes, paginação OPDS e fallback de capas; acrescentar testes dos cenários descritos.
3. Confirmar autenticação do dono e isolamento de dados, e testar o OPDS em um cliente real.
4. Implementar cadastro a partir de EPUB/PDF com revisão e detecção de duplicados.
5. Acrescentar cache e revisão de enriquecimento; depois avaliar navegação por autores/séries e busca no conteúdo.
