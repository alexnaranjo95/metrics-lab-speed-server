CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"run_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"phase" text DEFAULT 'analyzing' NOT NULL,
	"iteration" integer DEFAULT 0 NOT NULL,
	"work_dir" text NOT NULL,
	"checkpoint" jsonb,
	"last_error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_runs_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_optimization_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"session_type" text DEFAULT 'full_optimization' NOT NULL,
	"ai_model" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"target_metrics" jsonb,
	"initial_scores" jsonb,
	"final_scores" jsonb,
	"optimization_plan" jsonb,
	"iterations_completed" integer DEFAULT 0,
	"settings_history" jsonb,
	"successful_optimizations" jsonb,
	"failed_optimizations" jsonb,
	"ai_reasonings" jsonb,
	"lessons_learned" jsonb,
	"total_tokens_used" integer DEFAULT 0,
	"estimated_cost_usd" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cls_optimization_history" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"build_id" text,
	"cls_before" real,
	"cls_after" real,
	"cls_improvement" real,
	"images_dimensions_injected" integer DEFAULT 0,
	"fonts_optimized" integer DEFAULT 0,
	"dynamic_content_reserved" integer DEFAULT 0,
	"layout_containment_applied" integer DEFAULT 0,
	"estimated_improvement" real,
	"actual_improvement" real,
	"accuracy_score" real,
	"optimization_settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "optimization_knowledge_base" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern_name" text NOT NULL,
	"pattern_hash" text NOT NULL,
	"site_characteristics" jsonb NOT NULL,
	"successful_strategies" jsonb,
	"problematic_strategies" jsonb,
	"audit_solutions" jsonb,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"sample_size" integer DEFAULT 1 NOT NULL,
	"last_validated" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "optimization_knowledge_base_pattern_hash_unique" UNIQUE("pattern_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "optimization_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern_type" text NOT NULL,
	"pattern_description" text NOT NULL,
	"conditions" jsonb NOT NULL,
	"recommended_actions" jsonb,
	"avoided_actions" jsonb,
	"times_applied" integer DEFAULT 0,
	"successful_applications" integer DEFAULT 0,
	"average_improvement" real DEFAULT 0,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"last_applied" timestamp,
	"confidence" real DEFAULT 0.5,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pagespeed_audit_solutions" (
	"id" text PRIMARY KEY NOT NULL,
	"audit_id" text NOT NULL,
	"category" text NOT NULL,
	"solution_type" text NOT NULL,
	"description" text NOT NULL,
	"success_rate" real DEFAULT 0 NOT NULL,
	"average_improvement" real DEFAULT 0 NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"required_settings" jsonb,
	"code_changes_required" jsonb,
	"site_requirements" jsonb,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"risk_factors" jsonb,
	"rollback_procedure" text,
	"verification_steps" jsonb,
	"common_failure_reasons" jsonb,
	"troubleshooting_tips" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pagespeed_audit_history" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"build_id" text,
	"audit_id" text NOT NULL,
	"category" text NOT NULL,
	"score" real,
	"numeric_value" real,
	"display_value" text,
	"audit_data" jsonb,
	"previous_score" real,
	"score_improvement" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_headers_history" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"build_id" text,
	"best_practices_score_before" integer,
	"best_practices_score_after" integer,
	"score_improvement" integer,
	"csp_enabled" boolean DEFAULT false,
	"trusted_types_enabled" boolean DEFAULT false,
	"hsts_enabled" boolean DEFAULT false,
	"frame_protection_enabled" boolean DEFAULT false,
	"content_type_options_enabled" boolean DEFAULT false,
	"total_security_headers" integer DEFAULT 0,
	"security_headers_quality_score" real,
	"csp_directives_count" integer DEFAULT 0,
	"csp_has_trusted_types" boolean DEFAULT false,
	"headers_snapshot" jsonb,
	"optimization_settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_optimization_history" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"build_id" text,
	"score_before" integer,
	"score_after" integer,
	"score_improvement" integer,
	"meta_tags_injected" integer DEFAULT 0,
	"alt_attributes_added" integer DEFAULT 0,
	"links_optimized" integer DEFAULT 0,
	"crawlable_links_fixed" integer DEFAULT 0,
	"structured_data_injected" integer DEFAULT 0,
	"heading_hierarchy_fixed" integer DEFAULT 0,
	"audits_passed" integer DEFAULT 0,
	"audits_failed" integer DEFAULT 0,
	"critical_audits_failed" text,
	"optimization_settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_optimization_sessions" ADD CONSTRAINT "ai_optimization_sessions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cls_optimization_history" ADD CONSTRAINT "cls_optimization_history_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cls_optimization_history" ADD CONSTRAINT "cls_optimization_history_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pagespeed_audit_history" ADD CONSTRAINT "pagespeed_audit_history_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pagespeed_audit_history" ADD CONSTRAINT "pagespeed_audit_history_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_headers_history" ADD CONSTRAINT "security_headers_history_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_headers_history" ADD CONSTRAINT "security_headers_history_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seo_optimization_history" ADD CONSTRAINT "seo_optimization_history_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seo_optimization_history" ADD CONSTRAINT "seo_optimization_history_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_site_id_idx" ON "agent_runs" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_run_id_idx" ON "agent_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_site_status_idx" ON "agent_runs" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_opt_sessions_site_id_idx" ON "ai_optimization_sessions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_opt_sessions_status_idx" ON "ai_optimization_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_opt_sessions_started_idx" ON "ai_optimization_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_opt_sessions_type_idx" ON "ai_optimization_sessions" USING btree ("session_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cls_opt_site_id_idx" ON "cls_optimization_history" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cls_opt_build_id_idx" ON "cls_optimization_history" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cls_opt_improvement_idx" ON "cls_optimization_history" USING btree ("cls_improvement");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cls_opt_created_idx" ON "cls_optimization_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_pattern_hash_idx" ON "optimization_knowledge_base" USING btree ("pattern_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_confidence_idx" ON "optimization_knowledge_base" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patterns_type_idx" ON "optimization_patterns" USING btree ("pattern_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patterns_confidence_idx" ON "optimization_patterns" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patterns_success_rate_idx" ON "optimization_patterns" USING btree ((successful_applications::float / GREATEST(times_applied, 1)));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_solutions_audit_id_idx" ON "pagespeed_audit_solutions" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_solutions_category_idx" ON "pagespeed_audit_solutions" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_solutions_success_rate_idx" ON "pagespeed_audit_solutions" USING btree ("success_rate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_solutions_risk_level_idx" ON "pagespeed_audit_solutions" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pagespeed_audit_site_audit_idx" ON "pagespeed_audit_history" USING btree ("site_id","audit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pagespeed_audit_build_audit_idx" ON "pagespeed_audit_history" USING btree ("build_id","audit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pagespeed_audit_category_idx" ON "pagespeed_audit_history" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pagespeed_audit_created_idx" ON "pagespeed_audit_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_headers_site_id_idx" ON "security_headers_history" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_headers_build_id_idx" ON "security_headers_history" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_headers_improvement_idx" ON "security_headers_history" USING btree ("score_improvement");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_headers_created_idx" ON "security_headers_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_opt_site_id_idx" ON "seo_optimization_history" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_opt_build_id_idx" ON "seo_optimization_history" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_opt_improvement_idx" ON "seo_optimization_history" USING btree ("score_improvement");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_opt_created_idx" ON "seo_optimization_history" USING btree ("created_at");