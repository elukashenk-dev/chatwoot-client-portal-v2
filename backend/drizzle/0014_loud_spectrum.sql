CREATE TABLE "portal_tenant_provisioning_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"domain_mode" text NOT NULL,
	"display_name" text NOT NULL,
	"primary_domain" text NOT NULL,
	"provider_subdomain" text,
	"provider_tenant_domain_suffix" text,
	"public_base_url" text NOT NULL,
	"chatwoot_base_url" text NOT NULL,
	"client_admin_email" text NOT NULL,
	"client_admin_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"chatwoot_account_id" integer,
	"client_admin_user_id" integer,
	"runtime_service_user_id" integer,
	"admin_verification_service_user_id" integer,
	"chatwoot_portal_inbox_id" integer,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "portal_tenant_provisioning_runs_status_check" CHECK ("portal_tenant_provisioning_runs"."status" in ('pending', 'creating_chatwoot_account', 'creating_client_admin', 'creating_runtime_user', 'creating_admin_verification_user', 'creating_portal_inbox', 'creating_portal_tenant', 'verifying', 'completed', 'failed')),
	CONSTRAINT "portal_tenant_provisioning_runs_domain_mode_check" CHECK ("portal_tenant_provisioning_runs"."domain_mode" in ('custom_domain', 'provider_subdomain')),
	CONSTRAINT "portal_tenant_provisioning_runs_domain_fields_check" CHECK (("portal_tenant_provisioning_runs"."domain_mode" = 'custom_domain' and "portal_tenant_provisioning_runs"."provider_subdomain" is null and "portal_tenant_provisioning_runs"."provider_tenant_domain_suffix" is null) or ("portal_tenant_provisioning_runs"."domain_mode" = 'provider_subdomain' and "portal_tenant_provisioning_runs"."provider_subdomain" is not null and "portal_tenant_provisioning_runs"."provider_tenant_domain_suffix" is not null and "portal_tenant_provisioning_runs"."provider_subdomain" = "portal_tenant_provisioning_runs"."slug"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_tenant_provisioning_runs_slug_idx" ON "portal_tenant_provisioning_runs" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_tenant_provisioning_runs_primary_domain_idx" ON "portal_tenant_provisioning_runs" USING btree ("primary_domain");