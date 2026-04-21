CREATE TABLE "portal_chat_message_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"primary_conversation_id" integer NOT NULL,
	"client_message_key" text NOT NULL,
	"message_kind" text NOT NULL,
	"payload_sha256" text NOT NULL,
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
ALTER TABLE "portal_chat_message_sends" ADD CONSTRAINT "portal_chat_message_sends_user_id_portal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_message_sends_scope_unique" ON "portal_chat_message_sends" USING btree ("user_id","primary_conversation_id","client_message_key");--> statement-breakpoint
CREATE INDEX "portal_chat_message_sends_user_id_idx" ON "portal_chat_message_sends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "portal_chat_message_sends_conversation_id_idx" ON "portal_chat_message_sends" USING btree ("primary_conversation_id");--> statement-breakpoint
CREATE INDEX "portal_chat_message_sends_status_updated_at_idx" ON "portal_chat_message_sends" USING btree ("status","updated_at");