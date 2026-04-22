CREATE TABLE "chatwoot_webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
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
CREATE UNIQUE INDEX "chatwoot_webhook_deliveries_key_unique" ON "chatwoot_webhook_deliveries" USING btree ("delivery_key");--> statement-breakpoint
CREATE INDEX "chatwoot_webhook_deliveries_conversation_id_idx" ON "chatwoot_webhook_deliveries" USING btree ("chatwoot_conversation_id");--> statement-breakpoint
CREATE INDEX "chatwoot_webhook_deliveries_event_status_idx" ON "chatwoot_webhook_deliveries" USING btree ("event_name","status");