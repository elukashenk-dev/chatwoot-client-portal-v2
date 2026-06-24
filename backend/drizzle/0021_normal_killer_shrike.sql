CREATE TABLE "telegram_bridge_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"public_key" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text NOT NULL,
	"chatwoot_telegram_inbox_id" integer NOT NULL,
	"telegram_bot_id" text NOT NULL,
	"telegram_bot_username" text NOT NULL,
	"telegram_bot_token_ciphertext" text NOT NULL,
	"telegram_webhook_path_secret_ciphertext" text NOT NULL,
	"telegram_secret_token_ciphertext" text NOT NULL,
	"last_webhook_owner" text,
	"last_webhook_host" text,
	"last_webhook_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_bridge_configs_status_check" CHECK ("telegram_bridge_configs"."status" in ('active', 'disabled', 'rotating', 'archived')),
	CONSTRAINT "telegram_bridge_configs_last_webhook_owner_check" CHECK ("telegram_bridge_configs"."last_webhook_owner" is null or "telegram_bridge_configs"."last_webhook_owner" in ('empty', 'chatwoot-native', 'telegram-bridge', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "telegram_bridge_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"telegram_bridge_config_id" uuid NOT NULL,
	"update_id" bigint NOT NULL,
	"status" text NOT NULL,
	"telegram_chat_id" text,
	"telegram_from_id" text,
	"error_code" text,
	"error_message" text,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "telegram_bridge_deliveries_status_check" CHECK ("telegram_bridge_deliveries"."status" in ('processing', 'processed', 'failed')),
	CONSTRAINT "telegram_bridge_deliveries_error_message_length_check" CHECK ("telegram_bridge_deliveries"."error_message" is null or length("telegram_bridge_deliveries"."error_message") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "telegram_bridge_configs" ADD CONSTRAINT "telegram_bridge_configs_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_bridge_deliveries" ADD CONSTRAINT "telegram_bridge_deliveries_telegram_bridge_config_id_telegram_bridge_configs_id_fk" FOREIGN KEY ("telegram_bridge_config_id") REFERENCES "public"."telegram_bridge_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_bridge_configs_public_key_unique" ON "telegram_bridge_configs" USING btree ("public_key");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_bridge_configs_tenant_inbox_unique" ON "telegram_bridge_configs" USING btree ("tenant_id","chatwoot_telegram_inbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_bridge_configs_active_bot_id_unique" ON "telegram_bridge_configs" USING btree ("telegram_bot_id") WHERE "telegram_bridge_configs"."status" <> 'archived';--> statement-breakpoint
CREATE INDEX "telegram_bridge_configs_tenant_status_idx" ON "telegram_bridge_configs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_bridge_deliveries_config_update_unique" ON "telegram_bridge_deliveries" USING btree ("telegram_bridge_config_id","update_id");--> statement-breakpoint
CREATE INDEX "telegram_bridge_deliveries_config_status_idx" ON "telegram_bridge_deliveries" USING btree ("telegram_bridge_config_id","status");--> statement-breakpoint
CREATE INDEX "telegram_bridge_deliveries_updated_at_idx" ON "telegram_bridge_deliveries" USING btree ("updated_at");