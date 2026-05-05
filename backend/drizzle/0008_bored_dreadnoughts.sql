DROP INDEX "chatwoot_webhook_deliveries_key_unique";--> statement-breakpoint
DROP INDEX "chatwoot_webhook_deliveries_conversation_id_idx";--> statement-breakpoint
DROP INDEX "chatwoot_webhook_deliveries_event_status_idx";--> statement-breakpoint
DROP INDEX "portal_chat_message_sends_user_id_idx";--> statement-breakpoint
DROP INDEX "portal_chat_message_sends_conversation_id_idx";--> statement-breakpoint
DROP INDEX "portal_sessions_user_id_idx";--> statement-breakpoint
DROP INDEX "portal_user_chatwoot_conversations_user_id_unique";--> statement-breakpoint
DROP INDEX "portal_user_chatwoot_conversations_conversation_id_unique";--> statement-breakpoint
DROP INDEX "portal_user_chatwoot_conversations_contact_id_idx";--> statement-breakpoint
DROP INDEX "portal_user_contact_links_user_id_unique";--> statement-breakpoint
DROP INDEX "portal_user_contact_links_contact_id_unique";--> statement-breakpoint
DROP INDEX "portal_users_email_unique";--> statement-breakpoint
DROP INDEX "verification_records_email_idx";--> statement-breakpoint
DROP INDEX "verification_records_email_purpose_status_idx";--> statement-breakpoint
DROP INDEX "verification_records_portal_user_id_idx";--> statement-breakpoint
DROP INDEX "portal_chat_message_sends_scope_unique";--> statement-breakpoint
ALTER TABLE "chatwoot_webhook_deliveries" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "portal_chat_message_sends" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "portal_user_chatwoot_conversations" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "portal_user_contact_links" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "portal_users" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "verification_records" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
WITH default_tenant AS (
	SELECT "id"
	FROM "portal_tenants"
	ORDER BY CASE WHEN "slug" = 'default' THEN 0 ELSE 1 END, "id"
	LIMIT 1
)
UPDATE "portal_users"
SET "tenant_id" = (SELECT "id" FROM default_tenant)
WHERE "tenant_id" IS NULL;--> statement-breakpoint
WITH default_tenant AS (
	SELECT "id"
	FROM "portal_tenants"
	ORDER BY CASE WHEN "slug" = 'default' THEN 0 ELSE 1 END, "id"
	LIMIT 1
)
UPDATE "portal_sessions"
SET "tenant_id" = (SELECT "id" FROM default_tenant)
WHERE "tenant_id" IS NULL;--> statement-breakpoint
WITH default_tenant AS (
	SELECT "id"
	FROM "portal_tenants"
	ORDER BY CASE WHEN "slug" = 'default' THEN 0 ELSE 1 END, "id"
	LIMIT 1
)
UPDATE "portal_user_contact_links"
SET "tenant_id" = (SELECT "id" FROM default_tenant)
WHERE "tenant_id" IS NULL;--> statement-breakpoint
WITH default_tenant AS (
	SELECT "id"
	FROM "portal_tenants"
	ORDER BY CASE WHEN "slug" = 'default' THEN 0 ELSE 1 END, "id"
	LIMIT 1
)
UPDATE "portal_user_chatwoot_conversations"
SET "tenant_id" = (SELECT "id" FROM default_tenant)
WHERE "tenant_id" IS NULL;--> statement-breakpoint
WITH default_tenant AS (
	SELECT "id"
	FROM "portal_tenants"
	ORDER BY CASE WHEN "slug" = 'default' THEN 0 ELSE 1 END, "id"
	LIMIT 1
)
UPDATE "portal_chat_message_sends"
SET "tenant_id" = (SELECT "id" FROM default_tenant)
WHERE "tenant_id" IS NULL;--> statement-breakpoint
WITH default_tenant AS (
	SELECT "id"
	FROM "portal_tenants"
	ORDER BY CASE WHEN "slug" = 'default' THEN 0 ELSE 1 END, "id"
	LIMIT 1
)
UPDATE "chatwoot_webhook_deliveries"
SET "tenant_id" = (SELECT "id" FROM default_tenant)
WHERE "tenant_id" IS NULL;--> statement-breakpoint
WITH default_tenant AS (
	SELECT "id"
	FROM "portal_tenants"
	ORDER BY CASE WHEN "slug" = 'default' THEN 0 ELSE 1 END, "id"
	LIMIT 1
)
UPDATE "verification_records"
SET "tenant_id" = (SELECT "id" FROM default_tenant)
WHERE "tenant_id" IS NULL;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "portal_users" WHERE "tenant_id" IS NULL
		UNION ALL SELECT 1 FROM "portal_sessions" WHERE "tenant_id" IS NULL
		UNION ALL SELECT 1 FROM "portal_user_contact_links" WHERE "tenant_id" IS NULL
		UNION ALL SELECT 1 FROM "portal_user_chatwoot_conversations" WHERE "tenant_id" IS NULL
		UNION ALL SELECT 1 FROM "portal_chat_message_sends" WHERE "tenant_id" IS NULL
		UNION ALL SELECT 1 FROM "chatwoot_webhook_deliveries" WHERE "tenant_id" IS NULL
		UNION ALL SELECT 1 FROM "verification_records" WHERE "tenant_id" IS NULL
	) THEN
		RAISE EXCEPTION 'MT-4 tenant_id backfill failed: create a portal tenant before migrating existing tenant-owned rows.';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "chatwoot_webhook_deliveries" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_chat_message_sends" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_sessions" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_user_chatwoot_conversations" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_user_contact_links" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_users" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_records" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chatwoot_webhook_deliveries" ADD CONSTRAINT "chatwoot_webhook_deliveries_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_chat_message_sends" ADD CONSTRAINT "portal_chat_message_sends_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_user_chatwoot_conversations" ADD CONSTRAINT "portal_user_chatwoot_conversations_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_user_contact_links" ADD CONSTRAINT "portal_user_contact_links_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chatwoot_webhook_deliveries_tenant_key_unique" ON "chatwoot_webhook_deliveries" USING btree ("tenant_id","delivery_key");--> statement-breakpoint
CREATE INDEX "chatwoot_webhook_deliveries_tenant_conversation_id_idx" ON "chatwoot_webhook_deliveries" USING btree ("tenant_id","chatwoot_conversation_id");--> statement-breakpoint
CREATE INDEX "chatwoot_webhook_deliveries_tenant_event_status_idx" ON "chatwoot_webhook_deliveries" USING btree ("tenant_id","event_name","status");--> statement-breakpoint
CREATE INDEX "portal_chat_message_sends_tenant_user_id_idx" ON "portal_chat_message_sends" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "portal_chat_message_sends_tenant_conversation_id_idx" ON "portal_chat_message_sends" USING btree ("tenant_id","primary_conversation_id");--> statement-breakpoint
CREATE INDEX "portal_sessions_tenant_user_id_idx" ON "portal_sessions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_chatwoot_conversations_tenant_user_unique" ON "portal_user_chatwoot_conversations" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_chatwoot_conversations_tenant_conversation_unique" ON "portal_user_chatwoot_conversations" USING btree ("tenant_id","chatwoot_conversation_id");--> statement-breakpoint
CREATE INDEX "portal_user_chatwoot_conversations_tenant_contact_id_idx" ON "portal_user_chatwoot_conversations" USING btree ("tenant_id","chatwoot_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_contact_links_tenant_user_unique" ON "portal_user_contact_links" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_contact_links_tenant_contact_unique" ON "portal_user_contact_links" USING btree ("tenant_id","chatwoot_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_users_tenant_email_unique" ON "portal_users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "portal_users_tenant_id_idx" ON "portal_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "verification_records_tenant_email_idx" ON "verification_records" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "verification_records_tenant_email_purpose_status_idx" ON "verification_records" USING btree ("tenant_id","email","purpose","status");--> statement-breakpoint
CREATE INDEX "verification_records_tenant_portal_user_id_idx" ON "verification_records" USING btree ("tenant_id","portal_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_message_sends_scope_unique" ON "portal_chat_message_sends" USING btree ("tenant_id","user_id","primary_conversation_id","client_message_key");
