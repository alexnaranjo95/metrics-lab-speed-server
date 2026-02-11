CREATE TABLE IF NOT EXISTS "settings_history" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"settings" jsonb NOT NULL,
	"changed_by" text DEFAULT 'api',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settings_history" ADD CONSTRAINT "settings_history_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settings_history_site_id_idx" ON "settings_history" USING btree ("site_id");
