CREATE TABLE "portal_chat_read_watermarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"portal_user_id" integer NOT NULL,
	"thread_id" text NOT NULL,
	"last_read_message_id" integer DEFAULT 0 NOT NULL,
	"source_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_webhook_work" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_key" text NOT NULL,
	"event_name" text NOT NULL,
	"chatwoot_base_url" text NOT NULL,
	"chatwoot_account_id" integer NOT NULL,
	"chatwoot_inbox_id" integer NOT NULL,
	"chatwoot_conversation_id" integer NOT NULL,
	"chatwoot_message_id" integer,
	"portal_chat_thread_id" integer NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"unread_completed" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_webhook_work_status_check" CHECK ("portal_webhook_work"."status" in ('pending', 'done', 'exhausted')),
	CONSTRAINT "portal_webhook_work_event_check" CHECK ("portal_webhook_work"."event_name" in ('message_created', 'message_updated'))
);
--> statement-breakpoint
ALTER TABLE "portal_chat_read_watermarks" ADD CONSTRAINT "portal_chat_read_watermarks_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_chat_read_watermarks" ADD CONSTRAINT "portal_chat_read_watermarks_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_webhook_work" ADD CONSTRAINT "portal_webhook_work_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_read_watermarks_thread_unique" ON "portal_chat_read_watermarks" USING btree ("tenant_id","portal_user_id","thread_id","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_webhook_work_key_unique" ON "portal_webhook_work" USING btree ("tenant_id","work_key");--> statement-breakpoint
CREATE INDEX "portal_webhook_work_claim_idx" ON "portal_webhook_work" USING btree ("available_at","id") WHERE "portal_webhook_work"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "portal_webhook_work_backlog_idx" ON "portal_webhook_work" USING btree ("tenant_id","id") WHERE "portal_webhook_work"."status" <> 'done';--> statement-breakpoint
CREATE INDEX "portal_webhook_work_cleanup_idx" ON "portal_webhook_work" USING btree ("updated_at","id") WHERE "portal_webhook_work"."status" = 'done';