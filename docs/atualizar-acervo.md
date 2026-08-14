# Como atualizar o acervo

Guia do dia a dia: o que rodar depois de mexer na biblioteca do Calibre, e o
que rodar depois que o projeto ganha mudanças no banco. São coisas diferentes.

## Os dois comandos, e quando usar cada um

| O que aconteceu | O que rodar | Com que frequência |
| --- | --- | --- |
| Adicionei, removi ou editei livros no Calibre | `pnpm db:import-calibre` | Toda vez que a biblioteca muda |
| O projeto ganhou colunas ou tabelas novas (uma versão nova do código) | `pnpm db:migrate` e **depois** `pnpm db:import-calibre` | Raro — só quando avisado |

`db:migrate` mexe na **estrutura** do banco: cria colunas e tabelas. Não traz
nenhum livro.

`db:import-calibre` traz os **livros**: metadados e capas do Calibre para o
site. Não muda a estrutura.

Rodar `db:import-calibre` sem a estrutura nova dá erro de coluna inexistente.
Por isso, quando os dois forem necessários, a migração vem primeiro.

---

## Passo a passo: adicionei livros no Calibre

Isso é feito **no notebook de casa**, porque é lá que a biblioteca do Calibre
existe em disco.

### 1. Feche o Calibre

O Calibre mantém o `metadata.db` aberto enquanto está rodando. Fechar evita ler
um arquivo pela metade.

### 2. Espere o Google Drive terminar de sincronizar

O ícone do Google Drive na barra de tarefas precisa estar parado, sem a setinha
girando. Se ele ainda estiver enviando, o `metadata.db` em disco pode não conter
os livros que você acabou de adicionar.

Confira também que a pasta da biblioteca está **disponível off-line** no Drive,
e não apenas "na nuvem" — o importador lê os arquivos do disco, e um arquivo
que só existe na nuvem aparece vazio para ele.

### 3. Abra o terminal na pasta do projeto

No Windows, o caminho é `C:\Users\werne\WebstormProjects\book-inventory-main`.
No WebStorm, o terminal já abre nessa pasta.

### 4. Rode a importação

```bash
pnpm db:import-calibre --email=wernersaboia@gmail.com --path="G:\Meu Drive\Livros"
```

O `--path=` é a pasta que contém o arquivo `metadata.db` — conferida, é essa
mesma. As aspas são obrigatórias porque o caminho tem espaços.

O `--email=` diz de quem é o acervo. Use sempre o mesmo e-mail com que você
entra no site; um e-mail diferente cria um segundo acervo, vazio e separado.

> **Dica para digitar menos:** coloque `CALIBRE_PATH="G:\Meu Drive\Livros"` no
> arquivo `.env` do projeto. Aí o `--path=` deixa de ser necessário e o comando
> vira só `pnpm db:import-calibre --email=wernersaboia@gmail.com`.
>
> Se algum dia o pnpm reclamar de uma opção desconhecida em vez de repassá-la,
> ponha `--` antes dos parâmetros: `pnpm db:import-calibre -- --email=...`.

### 5. Leia o resumo no fim

```
─────────────────────────────────
🆕 Novos:         12
♻️  Atualizados:   3
⏭️  Pulados:       847
📦 Não possuídos: 1
❌ Erros:         0
📚 Total:         862
─────────────────────────────────
```

O que cada linha quer dizer:

- **Novos** — livros que entraram no site agora. Deve bater com o que você
  adicionou no Calibre.
- **Atualizados** — livros que já existiam e tiveram algum metadado alterado
  (título, autor, capa, sinopse).
- **Pulados** — nada mudou neles desde a última vez. É normal esse número ser
  o maior de todos.
- **Não possuídos** — livros que saíram da biblioteca do Calibre. Eles **não
  são apagados**: passam a aparecer como não possuídos, e o seu histórico de
  leitura continua lá. Se o livro voltar ao Calibre, ele volta a ser possuído
  sozinho na próxima importação.
- **Erros** — livros que falharam. O nome de cada um aparece acima do resumo.
  Quase sempre é capa corrompida ou metadado estranho; o resto do acervo é
  importado normalmente.

### 6. Confira no site

Abra o site no celular e veja se os livros novos estão lá. Não precisa
publicar nada nem rodar mais nenhum comando: a importação escreve direto no
banco que a produção usa.

---

## O que a importação nunca sobrescreve

Isso vale para todas as importações, e é por isso que rodar de novo é seguro:

- Status de leitura (lido, lendo, não lido, abandonado)
- Sua avaliação em estrelas
- Datas de início e de término
- Progresso de leitura e motivo de abandono
- As Bibliotecas (coleções) que você montou
- Livros que você cadastrou à mão no site

O Calibre manda apenas **catálogo**: título, autores, série, editora, ano,
idioma, páginas, sinopse, gênero e capa. O que é seu, sobre a sua leitura,
fica intocado.

---

## Passo a passo: o projeto ganhou uma versão nova

Quando o código muda o banco (colunas novas, por exemplo), a ordem é:

### 1. Traga o código novo

```bash
git pull
```

### 2. Instale dependências, se houver novas

```bash
pnpm install
```

### 3. Aplique a estrutura nova no banco

```bash
pnpm db:migrate
```

Esse comando usa a `POSTGRES_MIGRATION_URL` do `.env`, que é uma conexão com
mais permissão que a do site. Se ele reclamar de permissão, é essa variável
que está faltando ou errada.

### 4. Importe os livros

```bash
pnpm db:import-calibre --email=wernersaboia@gmail.com --path="G:\Meu Drive\Livros"
```

### 5. Publique

O deploy na Vercel acontece sozinho quando o código vai para o GitHub. A
migração acima é que precisa da sua mão, porque a Vercel não mexe no banco.

---

## Problemas comuns

**"Informe o e-mail"** — faltou o `--email=`. Ele não tem valor padrão de
propósito: sem ele, o importador não saberia de quem são os livros.

**Nenhum livro encontrado, ou "0 livros"** — o `--path=` está apontando para a
pasta errada. Confira que existe um `metadata.db` dentro dela.

**Erro de coluna que não existe** — falta rodar `pnpm db:migrate` antes.

**Livros que eu apaguei do Calibre continuam no site** — é o comportamento
correto. Eles ficam marcados como não possuídos para preservar o seu
histórico. Se quiser sumir com eles de vez, dá para apagar pelo site apenas os
que você cadastrou à mão; os que vieram do Calibre são protegidos.

**O importador trava ou demora muito** — quase sempre é o Google Drive
baixando os arquivos sob demanda. Deixe a pasta disponível off-line e tente de
novo.
