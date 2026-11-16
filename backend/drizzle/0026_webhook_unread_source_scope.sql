DROP INDEX "portal_chat_unread_messages_message_unique";--> statement-breakpoint
DROP INDEX "portal_chat_unread_messages_tenant_user_thread_idx";--> statement-breakpoint
DROP INDEX "portal_chat_unread_messages_tenant_user_created_at_idx";--> statement-breakpoint
ALTER TABLE "portal_chat_unread_messages" ADD COLUMN "source_key" text;--> statement-breakpoint
UPDATE "portal_chat_unread_messages" AS unread
SET "source_key" = substring(encode(sha256(convert_to(
  tenant.chatwoot_base_url || '|' || tenant.chatwoot_account_id::text || '|' || tenant.chatwoot_portal_inbox_id::text,
  'UTF8'
)), 'hex'), 1, 24)
FROM "portal_tenants" AS tenant
WHERE unread.tenant_id = tenant.id;--> statement-breakpoint
ALTER TABLE "portal_chat_unread_messages" ALTER COLUMN "source_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_unread_messages_message_unique" ON "portal_chat_unread_messages" USING btree ("tenant_id","source_key","portal_user_id","thread_id","chatwoot_message_id");--> statement-breakpoint
CREATE INDEX "portal_chat_unread_messages_tenant_user_thread_idx" ON "portal_chat_unread_messages" USING btree ("tenant_id","source_key","portal_user_id","thread_id");--> statement-breakpoint
CREATE INDEX "portal_chat_unread_messages_tenant_user_created_at_idx" ON "portal_chat_unread_messages" USING btree ("tenant_id","source_key","portal_user_id","created_at");