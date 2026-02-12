CREATE TABLE IF NOT EXISTS "performance_comparisons" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "build_id" text REFERENCES "builds"("id") ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS "perf_comp_site_tested_idx" ON "performance_comparisons" ("site_id", "tested_at");
CREATE INDEX IF NOT EXISTS "perf_comp_site_strategy_tested_idx" ON "performance_comparisons" ("site_id", "strategy", "tested_at");

CREATE TABLE IF NOT EXISTS "performance_monitors" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "frequency" text NOT NULL DEFAULT 'daily',
  "enabled" boolean NOT NULL DEFAULT true,
  "alert_on_regression" boolean NOT NULL DEFAULT true,
  "regression_threshold" integer DEFAULT -10,
  "last_run_at" timestamp,
  "next_run_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "perf_monitor_site_id_idx" ON "performance_monitors" ("site_id");

CREATE TABLE IF NOT EXISTS "alert_rules" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "metric" text NOT NULL,
  "condition" text NOT NULL,
  "value" real NOT NULL,
  "time_window" text DEFAULT '24h',
  "severity" text NOT NULL DEFAULT 'warning',
  "channels" jsonb DEFAULT '[]',
  "enabled" boolean NOT NULL DEFAULT true,
  "webhook_url" text,
  "slack_webhook_url" text,
  "last_triggered_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "alert_rule_site_id_idx" ON "alert_rules" ("site_id");

CREATE TABLE IF NOT EXISTS "alert_log" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "rule_id" text REFERENCES "alert_rules"("id") ON DELETE SET NULL,
  "message" text NOT NULL,
  "severity" text NOT NULL,
  "data" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "alert_log_site_id_idx" ON "alert_log" ("site_id");
