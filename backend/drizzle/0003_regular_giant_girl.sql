CREATE TABLE "portal_user_contact_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"chatwoot_contact_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_user_contact_links" ADD CONSTRAINT "portal_user_contact_links_user_id_portal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_contact_links_user_id_unique" ON "portal_user_contact_links" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_contact_links_contact_id_unique" ON "portal_user_contact_links" USING btree ("chatwoot_contact_id");