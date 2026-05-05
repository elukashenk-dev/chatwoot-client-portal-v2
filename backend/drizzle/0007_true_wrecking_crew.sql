CREATE TABLE "portal_tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"primary_domain" text NOT NULL,
	"public_base_url" text NOT NULL,
	"chatwoot_base_url" text NOT NULL,
	"chatwoot_account_id" integer NOT NULL,
	"chatwoot_portal_inbox_id" integer NOT NULL,
	"chatwoot_api_access_token_ciphertext" text NOT NULL,
	"chatwoot_webhook_secret_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_tenants_status_check" CHECK ("portal_tenants"."status" in ('active', 'suspended', 'provisioning', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_tenants_slug_unique" ON "portal_tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_tenants_primary_domain_unique" ON "portal_tenants" USING btree ("primary_domain");--> statement-breakpoint
CREATE INDEX "portal_tenants_status_idx" ON "portal_tenants" USING btree ("status");