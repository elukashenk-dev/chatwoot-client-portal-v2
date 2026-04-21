CREATE TABLE "verification_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"chatwoot_contact_id" integer NOT NULL,
	"code_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"resend_not_before" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"continuation_token_hash" text,
	"continuation_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "verification_records_email_idx" ON "verification_records" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_records_email_purpose_status_idx" ON "verification_records" USING btree ("email","purpose","status");--> statement-breakpoint
CREATE INDEX "verification_records_expires_at_idx" ON "verification_records" USING btree ("expires_at");