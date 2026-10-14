# Paginação nativa — 14/10/2026

Werner informou que a seta da direita continuava sem responder após `bd41be9`, sem exibir “Carregando página…”. O ambiente informado foi Firefox no notebook, em `https://library-next-taupe.vercel.app/`. A correção anterior reduziu trabalho antecipado, mas não resolveu o problema relatado; o teste isolado anterior não comprovava o funcionamento nessa sessão.

## Alteração

O controle agora é um componente de servidor. “Anterior” e “Próxima” são links HTML comuns com página e filtros no endereço; o salto “Ir” é um formulário GET comum. Foram removidos `next/link`, `router.push`, a interceptação `onNavigate`, a transição local e o bloqueio por pendência. Também saiu o Suspense exclusivo desse controle na página do catálogo.

Isso faz a paginação usar uma nova navegação de documento do navegador, sem depender da navegação cliente do Next ou de seu prefetch. O custo é recarregar a página inteira. A alteração não identifica, por si só, a causa exata da falha no Firefox; trata a dependência da navegação cliente com uma alternativa nativa verificável. O histórico de livros, os filtros, a autenticação e os dados de leitura não foram alterados.

## Verificações

- Build de produção aprovado, incluindo tipos e lint.
- Suíte local sem banco: 305 testes aprovados em 40 arquivos.
- 20 testes focados de paginação/estado de URL aprovados. Os quatro testes novos renderizam o controle sem provider do router cliente, verificando os destinos, filtros, formulário GET e limites.
- A configuração do Vitest passou a compilar JSX com runtime automático; o Next continua usando sua configuração existente.
- Reprodução de produção ampliada com os layouts raiz/principal e a página real, substituindo autenticação e consultas por módulos fictícios. Sem acesso ao acervo real. As adaptações de CSS/SW desse ambiente precisam ser consideradas ao interpretar o resultado.
- Com o CSS real compilado, a área central de “Próxima” atingiu o próprio link (sem sobreposição). Avanço 2→3, retorno 3→2, formulário 2→1 e novo avanço 1→2 trocaram os livros e preservaram busca/biblioteca. Conferido também em 390 px, sem overflow horizontal. Captura `paginacao-nativa-2026-10-14.jpg` na pasta de visualizações da sessão, com dados fictícios. Isso não constitui teste no Firefox nem validação do cache/SW em produção.

Não havia uma aba autenticada do usuário disponível nas ferramentas, nem acesso ao Firefox para automação. A confirmação da sessão real permanece necessária. Não foi solicitado apagar dados do site ou livros baixados.
