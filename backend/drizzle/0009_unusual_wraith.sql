CREATE TABLE "portal_rate_limit_buckets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"scope" text NOT NULL,
	"subject_key" text NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_rate_limit_buckets" ADD CONSTRAINT "portal_rate_limit_buckets_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_rate_limit_buckets_scope_unique" ON "portal_rate_limit_buckets" USING btree ("tenant_id","scope","subject_key");--> statement-breakpoint
CREATE INDEX "portal_rate_limit_buckets_reset_at_idx" ON "portal_rate_limit_buckets" USING btree ("reset_at");