CREATE TABLE IF NOT EXISTS "drive_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"folder_id" text NOT NULL,
	"folder_name" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
