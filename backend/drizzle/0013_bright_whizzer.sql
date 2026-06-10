ALTER TABLE "portal_branding_settings" ADD COLUMN "auth_content_surface_color" text;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD COLUMN "auth_content_surface_opacity" integer;--> statement-breakpoint
UPDATE "portal_branding_settings"
SET
  "auth_content_surface_color" = "auth_background_color",
  "auth_content_surface_opacity" = 100
WHERE "auth_background_color" IS NOT NULL
  AND lower("auth_background_color") <> '#f3f7fc'
  AND "auth_content_surface_color" IS NULL
  AND "auth_content_surface_opacity" IS NULL;
--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_auth_content_surface_opacity_check" CHECK ("portal_branding_settings"."auth_content_surface_opacity" is null or ("portal_branding_settings"."auth_content_surface_opacity" >= 0 and "portal_branding_settings"."auth_content_surface_opacity" <= 100));
