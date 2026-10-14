# Dependências de compilação e o alerta de braces

Tailwind CSS, seu plugin de animação, PostCSS e Autoprefixer ficam em
`devDependencies`: são ferramentas usadas para gerar o CSS, não bibliotecas
chamadas pelas rotas, componentes em execução ou consultas do catálogo.
A instalação de build deve incluir dependências de desenvolvimento, como já
acontece no CI e no build padrão da Vercel. Uma instalação somente de produção
deve receber o aplicativo já compilado; ela não pode executar `next build`.

O pacote indireto `braces@3.0.3` tem a vulnerabilidade
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm):
padrões profundamente aninhados podem esgotar a pilha e encerrar o processo
que os interpreta. A auditoria indica uma correção em `3.0.4`, mas essa versão
não estava publicada no registro na verificação de 14/10/2026; a versão mais
recente disponível era `3.0.3`.

Neste projeto os caminhos de produção identificados pela auditoria vinham
somente de Tailwind e tailwindcss-animate. Os padrões de arquivos são definidos
em `tailwind.config.ts`, sob controle do repositório. Não foi encontrada uma
rota que encaminhe entradas dos usuários para essas ferramentas.

Classificar corretamente essas ferramentas remove `braces` da árvore de
dependências de produção. Isso **não corrige o código vulnerável de braces**:
`pnpm audit` (incluindo desenvolvimento) ainda pode apontar o pacote. Não foi
adicionada exceção de auditoria, desativação do CI ou versão inexistente.
Quando uma versão corrigida estiver disponível, atualizar o lockfile e
executar novamente as auditorias, os testes de navegador e o build.

Validação:

- `pnpm audit --prod`: dependências de produção.
- `pnpm why braces --prod`: não deve encontrar o pacote.
- `pnpm audit`: inclui ferramentas de desenvolvimento; mantém visível o risco residual.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:browser` e `pnpm build`:
  confirmam que as ferramentas de compilação continuam disponíveis.
