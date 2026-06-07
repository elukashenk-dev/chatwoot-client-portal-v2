CREATE TABLE "portal_branding_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"kind" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" text NOT NULL,
	"content_hash" text NOT NULL,
	"original_filename" text,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_branding_assets_kind_check" CHECK ("portal_branding_assets"."kind" in ('logo', 'pwa_icon', 'auth_header_image', 'auth_footer_image', 'auth_background_image', 'chat_background_image', 'chat_header_background_image')),
	CONSTRAINT "portal_branding_assets_byte_size_check" CHECK ("portal_branding_assets"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "portal_branding_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"portal_name" text,
	"support_label" text,
	"primary_color" text,
	"accent_color" text,
	"auth_background_color" text,
	"chat_background_color" text,
	"chat_header_background_color" text,
	"auth_title" text,
	"auth_subtitle" text,
	"chat_empty_title" text,
	"chat_empty_body" text,
	"chat_info_title" text,
	"logo_asset_id" integer,
	"auth_header_image_asset_id" integer,
	"auth_footer_image_asset_id" integer,
	"auth_background_image_asset_id" integer,
	"chat_background_image_asset_id" integer,
	"chat_header_background_image_asset_id" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_branding_settings_version_check" CHECK ("portal_branding_settings"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "portal_branding_assets" ADD CONSTRAINT "portal_branding_assets_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_branding_assets_tenant_id_unique" ON "portal_branding_assets" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_branding_assets_object_key_unique" ON "portal_branding_assets" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "portal_branding_assets_tenant_kind_idx" ON "portal_branding_assets" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_branding_settings_tenant_unique" ON "portal_branding_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "portal_branding_settings_updated_at_idx" ON "portal_branding_settings" USING btree ("updated_at");--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_logo_asset_tenant_fk" FOREIGN KEY ("tenant_id","logo_asset_id") REFERENCES "public"."portal_branding_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_auth_header_asset_tenant_fk" FOREIGN KEY ("tenant_id","auth_header_image_asset_id") REFERENCES "public"."portal_branding_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_auth_footer_asset_tenant_fk" FOREIGN KEY ("tenant_id","auth_footer_image_asset_id") REFERENCES "public"."portal_branding_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_auth_background_asset_tenant_fk" FOREIGN KEY ("tenant_id","auth_background_image_asset_id") REFERENCES "public"."portal_branding_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_chat_background_asset_tenant_fk" FOREIGN KEY ("tenant_id","chat_background_image_asset_id") REFERENCES "public"."portal_branding_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_chat_header_background_asset_tenant_fk" FOREIGN KEY ("tenant_id","chat_header_background_image_asset_id") REFERENCES "public"."portal_branding_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
