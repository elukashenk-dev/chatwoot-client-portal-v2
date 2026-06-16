CREATE TABLE "portal_legal_acceptances" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"portal_user_id" integer,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"terms_accepted" boolean NOT NULL,
	"personal_data_consent_accepted" boolean NOT NULL,
	"terms_version" text NOT NULL,
	"privacy_policy_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_legal_acceptances_purpose_check" CHECK ("portal_legal_acceptances"."purpose" in ('registration')),
	CONSTRAINT "portal_legal_acceptances_terms_accepted_check" CHECK ("portal_legal_acceptances"."terms_accepted" = true),
	CONSTRAINT "portal_legal_acceptances_personal_data_consent_check" CHECK ("portal_legal_acceptances"."personal_data_consent_accepted" = true)
);
--> statement-breakpoint
ALTER TABLE "portal_legal_acceptances" ADD CONSTRAINT "portal_legal_acceptances_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_legal_acceptances" ADD CONSTRAINT "portal_legal_acceptances_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_legal_acceptances_tenant_email_idx" ON "portal_legal_acceptances" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "portal_legal_acceptances_tenant_user_idx" ON "portal_legal_acceptances" USING btree ("tenant_id","portal_user_id");