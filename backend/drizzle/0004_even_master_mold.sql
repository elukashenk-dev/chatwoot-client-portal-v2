CREATE TABLE "portal_user_chatwoot_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"chatwoot_contact_id" integer NOT NULL,
	"chatwoot_conversation_id" integer NOT NULL,
	"chatwoot_inbox_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_user_chatwoot_conversations" ADD CONSTRAINT "portal_user_chatwoot_conversations_user_id_portal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_chatwoot_conversations_user_id_unique" ON "portal_user_chatwoot_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_chatwoot_conversations_conversation_id_unique" ON "portal_user_chatwoot_conversations" USING btree ("chatwoot_conversation_id");--> statement-breakpoint
CREATE INDEX "portal_user_chatwoot_conversations_contact_id_idx" ON "portal_user_chatwoot_conversations" USING btree ("chatwoot_contact_id");