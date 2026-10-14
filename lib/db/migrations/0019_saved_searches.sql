CREATE TABLE "saved_searches" (
  "id" serial PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "name" text NOT NULL CHECK (length(trim("name")) BETWEEN 1 AND 80),
  "query" text NOT NULL CHECK (length("query") BETWEEN 1 AND 2000),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "idx_saved_searches_user" ON "saved_searches" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_saved_searches_user_name" ON "saved_searches" ("user_id", lower("name"));--> statement-breakpoint
ALTER TABLE "saved_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_searches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "saved_searches_owner" ON "saved_searches"
  USING ("user_id" = app_current_user_id())
  WITH CHECK ("user_id" = app_current_user_id());--> statement-breakpoint
DO $$
BEGIN
  IF current_schema() = 'public' THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "saved_searches" TO book_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE "saved_searches_id_seq" TO book_app';
  END IF;
END
$$;
