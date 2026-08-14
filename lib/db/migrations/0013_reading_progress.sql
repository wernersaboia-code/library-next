ALTER TABLE "books" ADD COLUMN "progress_percent" integer;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "progress_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "dnf_reason" text;--> statement-breakpoint

-- NULL e 0 são coisas diferentes: NULL é "nunca registrei", 0 é "comecei e
-- não avancei". Por isso a trava aceita nulo explicitamente.
ALTER TABLE "books" ADD CONSTRAINT "books_progress_percent_check"
  CHECK ("progress_percent" IS NULL
         OR ("progress_percent" >= 0 AND "progress_percent" <= 100));--> statement-breakpoint

-- Sem esta trava a coluna aceita qualquer texto, e um erro de digitação em
-- qualquer ponto do código cria um status fantasma: invisível nos filtros e
-- silencioso. Os registros atuais só contêm 'lido' e 'não lido' (AD-9).
ALTER TABLE "books" ADD CONSTRAINT "books_read_status_check"
  CHECK ("read_status" IN ('lido', 'lendo', 'não lido', 'abandonado'));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_books_progress_updated"
  ON "books" ("user_id", "progress_updated_at");
