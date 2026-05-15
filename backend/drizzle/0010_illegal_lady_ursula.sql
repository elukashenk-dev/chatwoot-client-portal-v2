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
	CONSTRAINT "portal_chat_threads_type_check" CHECK ("portal_chat_threads"."thread_type" in ('private', 'company')),
	CONSTRAINT "portal_chat_threads_private_user_check" CHECK (("portal_chat_threads"."thread_type" = 'private' and "portal_chat_threads"."portal_user_id" is not null) or ("portal_chat_threads"."thread_type" = 'company' and "portal_chat_threads"."portal_user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "portal_chat_message_sends" ADD COLUMN "portal_chat_thread_id" integer;--> statement-breakpoint
ALTER TABLE "portal_chat_message_sends" ADD COLUMN "author_display_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "portal_chat_threads" ADD CONSTRAINT "portal_chat_threads_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_chat_threads" ADD CONSTRAINT "portal_chat_threads_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_threads_tenant_private_user_unique" ON "portal_chat_threads" USING btree ("tenant_id","portal_user_id") WHERE "portal_chat_threads"."thread_type" = 'private';--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_threads_tenant_company_contact_unique" ON "portal_chat_threads" USING btree ("tenant_id","chatwoot_contact_id") WHERE "portal_chat_threads"."thread_type" = 'company';--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_threads_tenant_conversation_unique" ON "portal_chat_threads" USING btree ("tenant_id","chatwoot_conversation_id") WHERE "portal_chat_threads"."chatwoot_conversation_id" is not null;--> statement-breakpoint
CREATE INDEX "portal_chat_threads_tenant_contact_idx" ON "portal_chat_threads" USING btree ("tenant_id","chatwoot_contact_id");--> statement-breakpoint
INSERT INTO "portal_chat_threads" (
	"tenant_id",
	"thread_type",
	"portal_user_id",
	"chatwoot_contact_id",
	"chatwoot_inbox_id",
	"chatwoot_conversation_id",
	"created_at",
	"updated_at"
)
SELECT
	"tenant_id",
	'private',
	"user_id",
	"chatwoot_contact_id",
	"chatwoot_inbox_id",
	"chatwoot_conversation_id",
	"created_at",
	"updated_at"
FROM "portal_user_chatwoot_conversations"
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "portal_chat_message_sends" sends
SET "portal_chat_thread_id" = threads."id",
	"author_display_name_snapshot" = users."full_name"
FROM "portal_chat_threads" threads
JOIN "portal_users" users
	ON users."tenant_id" = threads."tenant_id"
	AND users."id" = threads."portal_user_id"
WHERE sends."tenant_id" = threads."tenant_id"
	AND sends."user_id" = threads."portal_user_id"
	AND sends."primary_conversation_id" = threads."chatwoot_conversation_id";--> statement-breakpoint
ALTER TABLE "portal_chat_message_sends" ADD CONSTRAINT "portal_chat_message_sends_portal_chat_thread_id_portal_chat_threads_id_fk" FOREIGN KEY ("portal_chat_thread_id") REFERENCES "public"."portal_chat_threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_message_sends_thread_scope_unique" ON "portal_chat_message_sends" USING btree ("tenant_id","portal_chat_thread_id","user_id","client_message_key") WHERE "portal_chat_message_sends"."portal_chat_thread_id" is not null;--> statement-breakpoint
CREATE INDEX "portal_chat_message_sends_tenant_thread_message_idx" ON "portal_chat_message_sends" USING btree ("tenant_id","portal_chat_thread_id","chatwoot_message_id");
