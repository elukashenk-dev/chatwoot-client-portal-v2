CREATE TABLE "chatwoot_webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"delivery_key" text NOT NULL,
	"event_name" text NOT NULL,
	"status" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"chatwoot_conversation_id" integer,
	"chatwoot_message_id" integer,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portal_chat_message_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"portal_chat_thread_id" integer NOT NULL,
	"client_message_key" text NOT NULL,
	"message_kind" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"author_display_name_snapshot" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"processing_token" text,
	"attempts_count" integer DEFAULT 1 NOT NULL,
	"chatwoot_message_id" integer,
	"confirmed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_chat_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"thread_type" text NOT NULL,
	"portal_user_id" integer,
	"chatwoot_contact_id" integer NOT NULL,
	"chatwoot_inbox_id" integer NOT NULL,
	"chatwoot_conversation_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_chat_threads_type_check" CHECK ("portal_chat_threads"."thread_type" in ('private', 'group')),
	CONSTRAINT "portal_chat_threads_private_user_check" CHECK (("portal_chat_threads"."thread_type" = 'private' and "portal_chat_threads"."portal_user_id" is not null) or ("portal_chat_threads"."thread_type" = 'group' and "portal_chat_threads"."portal_user_id" is null))
);
--> statement-breakpoint
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
CREATE TABLE "portal_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "portal_user_contact_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"chatwoot_contact_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"purpose" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"chatwoot_contact_id" integer,
	"portal_user_id" integer,
	"code_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"resend_not_before" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"continuation_token_hash" text,
	"continuation_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chatwoot_webhook_deliveries" ADD CONSTRAINT "chatwoot_webhook_deliveries_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_chat_message_sends" ADD CONSTRAINT "portal_chat_message_sends_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_chat_message_sends" ADD CONSTRAINT "portal_chat_message_sends_user_id_portal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_chat_message_sends" ADD CONSTRAINT "portal_chat_message_sends_portal_chat_thread_id_portal_chat_threads_id_fk" FOREIGN KEY ("portal_chat_thread_id") REFERENCES "public"."portal_chat_threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_chat_threads" ADD CONSTRAINT "portal_chat_threads_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_chat_threads" ADD CONSTRAINT "portal_chat_threads_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_rate_limit_buckets" ADD CONSTRAINT "portal_rate_limit_buckets_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_user_id_portal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_user_contact_links" ADD CONSTRAINT "portal_user_contact_links_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_user_contact_links" ADD CONSTRAINT "portal_user_contact_links_user_id_portal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chatwoot_webhook_deliveries_tenant_key_unique" ON "chatwoot_webhook_deliveries" USING btree ("tenant_id","delivery_key");--> statement-breakpoint
CREATE INDEX "chatwoot_webhook_deliveries_tenant_conversation_id_idx" ON "chatwoot_webhook_deliveries" USING btree ("tenant_id","chatwoot_conversation_id");--> statement-breakpoint
CREATE INDEX "chatwoot_webhook_deliveries_tenant_event_status_idx" ON "chatwoot_webhook_deliveries" USING btree ("tenant_id","event_name","status");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_message_sends_thread_scope_unique" ON "portal_chat_message_sends" USING btree ("tenant_id","portal_chat_thread_id","user_id","client_message_key");--> statement-breakpoint
CREATE INDEX "portal_chat_message_sends_tenant_user_id_idx" ON "portal_chat_message_sends" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "portal_chat_message_sends_tenant_thread_message_idx" ON "portal_chat_message_sends" USING btree ("tenant_id","portal_chat_thread_id","chatwoot_message_id");--> statement-breakpoint
CREATE INDEX "portal_chat_message_sends_status_updated_at_idx" ON "portal_chat_message_sends" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_threads_tenant_private_user_unique" ON "portal_chat_threads" USING btree ("tenant_id","portal_user_id") WHERE "portal_chat_threads"."thread_type" = 'private';--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_threads_tenant_group_contact_unique" ON "portal_chat_threads" USING btree ("tenant_id","chatwoot_contact_id") WHERE "portal_chat_threads"."thread_type" = 'group';--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_threads_tenant_conversation_unique" ON "portal_chat_threads" USING btree ("tenant_id","chatwoot_conversation_id") WHERE "portal_chat_threads"."chatwoot_conversation_id" is not null;--> statement-breakpoint
CREATE INDEX "portal_chat_threads_tenant_contact_idx" ON "portal_chat_threads" USING btree ("tenant_id","chatwoot_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_rate_limit_buckets_scope_unique" ON "portal_rate_limit_buckets" USING btree ("tenant_id","scope","subject_key");--> statement-breakpoint
CREATE INDEX "portal_rate_limit_buckets_reset_at_idx" ON "portal_rate_limit_buckets" USING btree ("reset_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_sessions_token_hash_unique" ON "portal_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "portal_sessions_tenant_user_id_idx" ON "portal_sessions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "portal_sessions_expires_at_idx" ON "portal_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_tenants_slug_unique" ON "portal_tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_tenants_primary_domain_unique" ON "portal_tenants" USING btree ("primary_domain");--> statement-breakpoint
CREATE INDEX "portal_tenants_status_idx" ON "portal_tenants" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_contact_links_tenant_user_unique" ON "portal_user_contact_links" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_contact_links_tenant_contact_unique" ON "portal_user_contact_links" USING btree ("tenant_id","chatwoot_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_users_tenant_email_unique" ON "portal_users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "portal_users_tenant_id_idx" ON "portal_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "verification_records_tenant_email_idx" ON "verification_records" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "verification_records_tenant_email_purpose_status_idx" ON "verification_records" USING btree ("tenant_id","email","purpose","status");--> statement-breakpoint
CREATE INDEX "verification_records_expires_at_idx" ON "verification_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_records_tenant_portal_user_id_idx" ON "verification_records" USING btree ("tenant_id","portal_user_id");