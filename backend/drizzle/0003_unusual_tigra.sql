CREATE TABLE "portal_chat_notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"portal_user_id" integer NOT NULL,
	"thread_id" text NOT NULL,
	"new_messages_enabled_override" boolean,
	"sound_enabled_override" boolean,
	"push_enabled_override" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_push_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"portal_user_id" integer NOT NULL,
	"portal_chat_thread_id" integer,
	"thread_id" text NOT NULL,
	"chatwoot_message_id" integer NOT NULL,
	"subscription_id" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_push_deliveries_status_check" CHECK ("portal_push_deliveries"."status" in ('sent', 'skipped', 'failed', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "portal_push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"portal_user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"vapid_key_id" text NOT NULL,
	"vapid_public_key_fingerprint" text NOT NULL,
	"user_agent" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_push_subscriptions_status_check" CHECK ("portal_push_subscriptions"."status" in ('active', 'expired', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "portal_user_notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"portal_user_id" integer NOT NULL,
	"new_messages_enabled" boolean DEFAULT true NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"push_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_chat_notification_preferences" ADD CONSTRAINT "portal_chat_notification_preferences_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_chat_notification_preferences" ADD CONSTRAINT "portal_chat_notification_preferences_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_push_deliveries" ADD CONSTRAINT "portal_push_deliveries_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_push_deliveries" ADD CONSTRAINT "portal_push_deliveries_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_push_deliveries" ADD CONSTRAINT "portal_push_deliveries_portal_chat_thread_id_portal_chat_threads_id_fk" FOREIGN KEY ("portal_chat_thread_id") REFERENCES "public"."portal_chat_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_push_deliveries" ADD CONSTRAINT "portal_push_deliveries_subscription_id_portal_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."portal_push_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_push_subscriptions" ADD CONSTRAINT "portal_push_subscriptions_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_push_subscriptions" ADD CONSTRAINT "portal_push_subscriptions_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_user_notification_preferences" ADD CONSTRAINT "portal_user_notification_preferences_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_user_notification_preferences" ADD CONSTRAINT "portal_user_notification_preferences_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_notification_preferences_thread_unique" ON "portal_chat_notification_preferences" USING btree ("tenant_id","portal_user_id","thread_id");--> statement-breakpoint
CREATE INDEX "portal_chat_notification_preferences_tenant_user_idx" ON "portal_chat_notification_preferences" USING btree ("tenant_id","portal_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_push_deliveries_subscription_unique" ON "portal_push_deliveries" USING btree ("tenant_id","portal_user_id","thread_id","chatwoot_message_id","subscription_id");--> statement-breakpoint
CREATE INDEX "portal_push_deliveries_tenant_thread_message_idx" ON "portal_push_deliveries" USING btree ("tenant_id","thread_id","chatwoot_message_id");--> statement-breakpoint
CREATE INDEX "portal_push_deliveries_tenant_user_created_at_idx" ON "portal_push_deliveries" USING btree ("tenant_id","portal_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_push_subscriptions_user_endpoint_unique" ON "portal_push_subscriptions" USING btree ("tenant_id","portal_user_id","endpoint");--> statement-breakpoint
CREATE INDEX "portal_push_subscriptions_tenant_user_status_idx" ON "portal_push_subscriptions" USING btree ("tenant_id","portal_user_id","status");--> statement-breakpoint
CREATE INDEX "portal_push_subscriptions_tenant_status_idx" ON "portal_push_subscriptions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_notification_preferences_user_unique" ON "portal_user_notification_preferences" USING btree ("tenant_id","portal_user_id");--> statement-breakpoint
CREATE INDEX "portal_user_notification_preferences_tenant_user_idx" ON "portal_user_notification_preferences" USING btree ("tenant_id","portal_user_id");