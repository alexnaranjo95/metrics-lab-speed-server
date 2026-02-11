CREATE TABLE IF NOT EXISTS "asset_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"url_pattern" text NOT NULL,
	"asset_type" text,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "resolved_settings" jsonb;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_overrides" ADD CONSTRAINT "asset_overrides_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_override_site_id_idx" ON "asset_overrides" USING btree ("site_id");