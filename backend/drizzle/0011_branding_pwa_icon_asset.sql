CREATE UNIQUE INDEX IF NOT EXISTS "portal_branding_assets_tenant_id_unique" ON "portal_branding_assets" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD COLUMN "pwa_icon_asset_id" integer;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_pwa_icon_asset_tenant_fk" FOREIGN KEY ("tenant_id","pwa_icon_asset_id") REFERENCES "public"."portal_branding_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
