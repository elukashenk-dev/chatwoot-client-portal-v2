CREATE TABLE "portal_chat_unread_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"portal_user_id" integer NOT NULL,
	"portal_chat_thread_id" integer,
	"thread_id" text NOT NULL,
	"chatwoot_message_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_chat_unread_messages" ADD CONSTRAINT "portal_chat_unread_messages_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_chat_unread_messages" ADD CONSTRAINT "portal_chat_unread_messages_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_chat_unread_messages" ADD CONSTRAINT "portal_chat_unread_messages_portal_chat_thread_id_portal_chat_threads_id_fk" FOREIGN KEY ("portal_chat_thread_id") REFERENCES "public"."portal_chat_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_unread_messages_message_unique" ON "portal_chat_unread_messages" USING btree ("tenant_id","portal_user_id","thread_id","chatwoot_message_id");--> statement-breakpoint
CREATE INDEX "portal_chat_unread_messages_tenant_user_thread_idx" ON "portal_chat_unread_messages" USING btree ("tenant_id","portal_user_id","thread_id");--> statement-breakpoint
CREATE INDEX "portal_chat_unread_messages_tenant_user_created_at_idx" ON "portal_chat_unread_messages" USING btree ("tenant_id","portal_user_id","created_at");