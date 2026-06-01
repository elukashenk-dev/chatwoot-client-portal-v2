DELETE FROM "portal_push_deliveries";--> statement-breakpoint
DELETE FROM "portal_push_subscriptions";--> statement-breakpoint
ALTER TABLE "portal_push_subscriptions" ADD COLUMN "device_id" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_push_subscriptions_active_device_unique" ON "portal_push_subscriptions" USING btree ("tenant_id","portal_user_id","device_id") WHERE "portal_push_subscriptions"."status" = 'active';
