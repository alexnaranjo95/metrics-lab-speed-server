CREATE TABLE IF NOT EXISTS "alert_log" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"rule_id" text,
	"message" text NOT NULL,
	"severity" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"metric" text NOT NULL,
	"condition" text NOT NULL,
	"value" real NOT NULL,
	"time_window" text DEFAULT '24h',
	"severity" text DEFAULT 'warning' NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"webhook_url" text,
	"slack_webhook_url" text,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "performance_comparisons" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"build_id" text,
	"tested_at" timestamp DEFAULT now() NOT NULL,
	"strategy" text NOT NULL,
	"original_domain" text NOT NULL,
	"optimized_domain" text NOT NULL,
	"original_performance_score" integer,
	"original_lcp_ms" real,
	"original_tbt_ms" real,
	"original_cls" real,
	"original_fcp_ms" real,
	"original_si_ms" real,
	"original_ttfb_ms" real,
	"optimized_performance_score" integer,
	"optimized_lcp_ms" real,
	"optimized_tbt_ms" real,
	"optimized_cls" real,
	"optimized_fcp_ms" real,
	"optimized_si_ms" real,
	"optimized_ttfb_ms" real,
	"score_improvement" real,
	"lcp_improvement" real,
	"tbt_improvement" real,
	"cls_improvement" real,
	"fcp_improvement" real,
	"si_improvement" real,
	"total_payload_reduction_kb" integer,
	"image_optimization_savings_kb" integer,
	"js_optimization_savings_kb" integer,
	"css_optimization_savings_kb" integer,
	"raw_lighthouse_original" jsonb,
	"raw_lighthouse_optimized" jsonb,
	"field_data_original" jsonb,
	"field_data_optimized" jsonb,
	"opportunities_original" jsonb,
	"opportunities_optimized" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "performance_monitors" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"frequency" text DEFAULT 'daily' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"alert_on_regression" boolean DEFAULT true NOT NULL,
	"regression_threshold" integer DEFAULT -10,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings_history" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"settings" jsonb NOT NULL,
	"changed_by" text DEFAULT 'api',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "deployment_number" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_log" ADD CONSTRAINT "alert_log_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_log" ADD CONSTRAINT "alert_log_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_comparisons" ADD CONSTRAINT "performance_comparisons_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_comparisons" ADD CONSTRAINT "performance_comparisons_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_monitors" ADD CONSTRAINT "performance_monitors_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settings_history" ADD CONSTRAINT "settings_history_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_log_site_id_idx" ON "alert_log" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rule_site_id_idx" ON "alert_rules" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "perf_comp_site_tested_idx" ON "performance_comparisons" USING btree ("site_id","tested_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "perf_comp_site_strategy_tested_idx" ON "performance_comparisons" USING btree ("site_id","strategy","tested_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "perf_monitor_site_id_idx" ON "performance_monitors" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settings_history_site_id_idx" ON "settings_history" USING btree ("site_id");