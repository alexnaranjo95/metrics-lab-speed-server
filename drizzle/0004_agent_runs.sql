CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"run_id" text NOT NULL UNIQUE,
	"status" text DEFAULT 'running' NOT NULL,
	"phase" text DEFAULT 'analyzing' NOT NULL,
	"iteration" integer DEFAULT 0 NOT NULL,
	"work_dir" text NOT NULL,
	"checkpoint" jsonb,
	"last_error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_site_id_idx" ON "agent_runs" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_run_id_idx" ON "agent_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_site_status_idx" ON "agent_runs" USING btree ("site_id","status");
