-- A constraint antiga (0009) trava a nota em inteiros de 1 a 5. Precisa cair
-- antes da troca de tipo: um CHECK sobre a coluna impede o ALTER TYPE.
ALTER TABLE "books" DROP CONSTRAINT IF EXISTS "books_my_rating_range";--> statement-breakpoint

-- `real` em vez de inteiro em meios (1..10): o número gravado passa a ser o
-- número exibido, sem nenhum leitor precisar dividir por 2. Múltiplos de 0,5
-- são exatos em binário, então não há erro de arredondamento.
-- Os valores 1..5 já gravados continuam válidos — não há reescrita de dados.
ALTER TABLE "books" ALTER COLUMN "my_rating" TYPE real;--> statement-breakpoint

ALTER TABLE "books" ADD CONSTRAINT "books_my_rating_range"
  CHECK ("my_rating" IS NULL
         OR ("my_rating" >= 0.5 AND "my_rating" <= 5
             AND ("my_rating" * 2) = floor("my_rating" * 2)));--> statement-breakpoint

ALTER TABLE "books" ADD COLUMN "next_up" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "favorite" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Índices parciais: as duas listas são pequenas por natureza (dezenas de
-- linhas num acervo de mais de mil). Indexar a coluna inteira gastaria
-- espaço para encontrar o que cabe numa tela.
CREATE INDEX IF NOT EXISTS "idx_books_user_next_up"
  ON "books" ("user_id") WHERE "next_up";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_user_favorite"
  ON "books" ("user_id") WHERE "favorite";
