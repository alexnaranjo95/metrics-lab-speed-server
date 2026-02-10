CREATE TABLE IF NOT EXISTS "builds" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"scope" text DEFAULT 'full' NOT NULL,
	"triggered_by" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"pages_total" integer,
	"pages_processed" integer DEFAULT 0,
	"original_size_bytes" bigint,
	"optimized_size_bytes" bigint,
	"js_original_bytes" bigint,
	"js_optimized_bytes" bigint,
	"css_original_bytes" bigint,
	"css_optimized_bytes" bigint,
	"image_original_bytes" bigint,
	"image_optimized_bytes" bigint,
	"facades_applied" integer DEFAULT 0,
	"scripts_removed" integer DEFAULT 0,
	"lighthouse_score_before" integer,
	"lighthouse_score_after" integer,
	"ttfb_before" integer,
	"ttfb_after" integer,
	"error_message" text,
	"error_details" jsonb,
	"build_log" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"path" text NOT NULL,
	"title" text,
	"content_hash" text,
	"original_size_bytes" integer,
	"optimized_size_bytes" integer,
	"last_crawled_at" timestamp,
	"last_deployed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"site_url" text NOT NULL,
	"webhook_secret" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_build_id" text,
	"last_build_status" text,
	"last_build_at" timestamp,
	"edge_url" text,
	"cloudflare_project_name" text,
	"page_count" integer,
	"total_size_bytes" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "builds" ADD CONSTRAINT "builds_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pages" ADD CONSTRAINT "pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "build_site_id_idx" ON "builds" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "build_status_idx" ON "builds" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_site_path_idx" ON "pages" USING btree ("site_id","path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_url_idx" ON "sites" USING btree ("site_url");