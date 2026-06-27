ALTER TABLE "portal_legal_acceptances" DROP CONSTRAINT "portal_legal_acceptances_purpose_check";
--> statement-breakpoint
ALTER TABLE "portal_legal_acceptances" ADD CONSTRAINT "portal_legal_acceptances_purpose_check" CHECK ("portal_legal_acceptances"."purpose" in ('customer_access'));
