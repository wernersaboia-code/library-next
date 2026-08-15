# Como ativar a RLS em produção

A RLS está no banco desde a migration `0007_rls` — políticas por usuário,
falha fechada, papel `book_app` criado. O que **não** foi feito ainda é o
corte: a aplicação ainda conecta com o papel `postgres`, que tem
`BYPASSRLS` e ignora as políticas. Enquanto isso, a RLS fica inerte.

Este documento é o passo a passo do corte. Feito uma vez, não precisa repetir.

## O que muda e por quê

| Hoje | Depois |
| --- | --- |
| `POSTGRES_URL` aponta para `postgres` (dono, BYPASSRLS) | `POSTGRES_URL` aponta para `book_app` (sem BYPASSRLS) |
| Aplicação e scripts rodam com poder de dono | Aplicação respeita as políticas; cada usuário só vê o que é dele |

O `book_app` já existe e já tem grants sobre as tabelas (criados pela
migration `0007`). Falta só a senha e a troca da URL.

## Passo a passo

### 1. Definir uma senha para o `book_app`

No SQL Editor do Supabase (conectado como dono):

```sql
ALTER ROLE book_app WITH LOGIN PASSWORD 'senha-forte-e-nova';
```

A `senha` do exemplo no `.env.example` é um placeholder — não pode ser a
real.

### 2. Apontar a aplicação para o `book_app`

Em todos os ambientes da aplicação (Vercel, variáveis de produção):

```
POSTGRES_URL="postgresql://book_app:senha-forte-e-nova@db.<projeto>.supabase.co:6543/postgres"
```

A porta `6543` é o pooler do Supabase em modo transaction, que o
`lib/db/drizzle.ts` já assume (`prepare: false`).

`NEXT_PUBLIC_*` e `SUPABASE_*` não mudam.

### 3. Deixar a URL de owner só para quem precisa

`POSTGRES_MIGRATION_URL` (papel `postgres`) já existe no `.env.example` e é
usada pelo `drizzle-kit`. **Atenção:** os scripts `pnpm db:migrate` e
`pnpm db:import-calibre` carregam `lib/db/drizzle.ts`, que lê
`POSTGRES_URL` — depois do corte, eles rodariam como `book_app`, que não
tem privilégio de esquema para criar/alterar tabelas.

Duas opções:

- **Recomendada (mínima):** troque a `POSTGRES_URL` **só nos ambientes da
  Vercel**. O `.env` local (que roda `db:migrate` e `db:import-calibre`)
  continua com a URL de owner até que os scripts passem a usar
  `POSTGRES_MIGRATION_URL` — mudança de código, fora deste guia.
- **Completa:** ajuste `lib/db/migrate.ts` e `lib/db/import-calibre.ts`
  para abrirem a própria conexão com `POSTGRES_MIGRATION_URL`. Aí a
  `POSTGRES_URL` de owner some de vez. (A importação via `book_app`
  também funcionaria — o `withUser` seta `app.user_id` e as políticas
  passam — mas migrations exigem dono.)

### 4. Conferir

1. No SQL Editor, `select * from pg_roles where rolname = 'book_app';` —
   deve mostrar o papel com `rolcanlogin` e sem `rolbypassrls`.
2. No site, logado: a home lista seus livros como antes. O sinal bom de
   que a RLS está pegando é um 404/vazio para livro de outro usuário — mas
   isso nunca é alcançável pela interface, então o teste prático é: **nada
   quebrar** depois do deploy.

## Por que `book_app` em vez de `postgres`

`postgres` tem `BYPASSRLS`: é o papel administrativo do Supabase. Quem
conecta como ele ignora `FORCE ROW LEVEL SECURITY` e enxerga todas as
linhas de todos os usuários. O `book_app` foi criado sem `BYPASSRLS` e sem
ownership de tabela — só os grants mínimos — então as policies de posse
(`user_id = app_current_user_id()`) valem de verdade.

## Referências

- Migration `lib/db/migrations/0007_rls.sql` — papel, grants e policies.
- `lib/db/drizzle.ts` — conexão da aplicação (`POSTGRES_URL`).
- `.env.example` — as duas URLs e o papel de cada uma.
