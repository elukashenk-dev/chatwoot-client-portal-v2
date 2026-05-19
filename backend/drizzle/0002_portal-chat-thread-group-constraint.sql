DROP INDEX IF EXISTS "portal_chat_threads_tenant_company_contact_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "portal_chat_threads_tenant_group_contact_unique";--> statement-breakpoint
ALTER TABLE "portal_chat_threads" DROP CONSTRAINT IF EXISTS "portal_chat_threads_type_check";--> statement-breakpoint
ALTER TABLE "portal_chat_threads" DROP CONSTRAINT IF EXISTS "portal_chat_threads_private_user_check";--> statement-breakpoint
UPDATE "portal_chat_threads"
SET "thread_type" = 'group'
WHERE "thread_type" = 'company';--> statement-breakpoint
ALTER TABLE "portal_chat_threads" ADD CONSTRAINT "portal_chat_threads_type_check" CHECK ("portal_chat_threads"."thread_type" in ('private', 'group'));--> statement-breakpoint
ALTER TABLE "portal_chat_threads" ADD CONSTRAINT "portal_chat_threads_private_user_check" CHECK (("portal_chat_threads"."thread_type" = 'private' and "portal_chat_threads"."portal_user_id" is not null) or ("portal_chat_threads"."thread_type" = 'group' and "portal_chat_threads"."portal_user_id" is null));--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_threads_tenant_group_contact_unique" ON "portal_chat_threads" USING btree ("tenant_id","chatwoot_contact_id") WHERE "portal_chat_threads"."thread_type" = 'group';
