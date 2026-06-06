CREATE TABLE "portal_admin_audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"actor_email" text,
	"actor_chatwoot_agent_id" integer,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"subject_email" text,
	"request_ip" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_admin_login_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"email" text NOT NULL,
	"chatwoot_agent_id" integer NOT NULL,
	"role" text NOT NULL,
	"code_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"resend_not_before" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_admin_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"chatwoot_agent_id" integer NOT NULL,
	"role" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_admin_audit_events" ADD CONSTRAINT "portal_admin_audit_events_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_admin_login_challenges" ADD CONSTRAINT "portal_admin_login_challenges_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_admin_sessions" ADD CONSTRAINT "portal_admin_sessions_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_admin_audit_events_tenant_created_at_idx" ON "portal_admin_audit_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "portal_admin_audit_events_tenant_action_idx" ON "portal_admin_audit_events" USING btree ("tenant_id","action");--> statement-breakpoint
CREATE INDEX "portal_admin_login_challenges_tenant_email_status_idx" ON "portal_admin_login_challenges" USING btree ("tenant_id","email","status");--> statement-breakpoint
CREATE INDEX "portal_admin_login_challenges_expires_at_idx" ON "portal_admin_login_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_admin_sessions_token_hash_unique" ON "portal_admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "portal_admin_sessions_tenant_email_idx" ON "portal_admin_sessions" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "portal_admin_sessions_expires_at_idx" ON "portal_admin_sessions" USING btree ("expires_at");