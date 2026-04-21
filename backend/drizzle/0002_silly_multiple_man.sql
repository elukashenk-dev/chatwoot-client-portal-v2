ALTER TABLE "verification_records" ALTER COLUMN "full_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_records" ALTER COLUMN "chatwoot_contact_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_records" ADD COLUMN "portal_user_id" integer;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_records_portal_user_id_idx" ON "verification_records" USING btree ("portal_user_id");