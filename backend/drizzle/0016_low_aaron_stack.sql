ALTER TABLE "portal_branding_assets" DROP CONSTRAINT "portal_branding_assets_kind_check";--> statement-breakpoint
ALTER TABLE "portal_branding_settings" DROP CONSTRAINT "portal_branding_settings_auth_header_asset_tenant_fk";
--> statement-breakpoint
ALTER TABLE "portal_branding_settings" DROP CONSTRAINT "portal_branding_settings_auth_footer_asset_tenant_fk";
--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD COLUMN "auth_background_overlay" text;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD COLUMN "auth_button_style" text;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD COLUMN "auth_color_scheme" text;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD COLUMN "auth_field_style" text;--> statement-breakpoint
ALTER TABLE "portal_branding_settings" DROP COLUMN "auth_header_image_asset_id";--> statement-breakpoint
ALTER TABLE "portal_branding_settings" DROP COLUMN "auth_footer_image_asset_id";--> statement-breakpoint
DELETE FROM "portal_branding_assets"
WHERE "kind" IN ('auth_header_image', 'auth_footer_image');--> statement-breakpoint
ALTER TABLE "portal_branding_assets" ADD CONSTRAINT "portal_branding_assets_kind_check" CHECK ("portal_branding_assets"."kind" in ('logo', 'pwa_icon', 'auth_background_image', 'chat_background_image', 'chat_header_background_image'));--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_auth_color_scheme_check" CHECK ("portal_branding_settings"."auth_color_scheme" is null or "portal_branding_settings"."auth_color_scheme" in ('light', 'dark'));--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_auth_background_overlay_check" CHECK ("portal_branding_settings"."auth_background_overlay" is null or "portal_branding_settings"."auth_background_overlay" in ('none', 'light', 'dark'));--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_auth_field_style_check" CHECK ("portal_branding_settings"."auth_field_style" is null or "portal_branding_settings"."auth_field_style" in ('solid', 'translucent', 'outline'));--> statement-breakpoint
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_auth_button_style_check" CHECK ("portal_branding_settings"."auth_button_style" is null or "portal_branding_settings"."auth_button_style" in ('solid', 'gradient'));
