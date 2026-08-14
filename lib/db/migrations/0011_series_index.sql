ALTER TABLE "books" ADD COLUMN "series_index" real;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_books_user_series_name" ON "books" USING btree ("user_id","series");--> statement-breakpoint

-- O import antigo gravava nome e volume numa coluna só ("Ilium #2"), o que
-- fazia cada volume virar uma série distinta: 86 livros em série produziam 82
-- valores diferentes. Separa os dois campos nos registros já importados — o
-- sync é incremental por watermark e não revisitaria esses livros sozinho.
--
-- Idempotente: o WHERE só casa com o sufixo " #n"/" #n.m", que deixa de
-- existir depois da primeira passada.
UPDATE "books"
SET "series_index" = (regexp_match("series", '#([0-9]+(\.[0-9]+)?)$'))[1]::real,
    "series"       = regexp_replace("series", '\s*#[0-9]+(\.[0-9]+)?$', '')
WHERE "series" ~ '\s#[0-9]+(\.[0-9]+)?$';
