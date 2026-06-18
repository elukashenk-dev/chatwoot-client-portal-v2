CREATE TABLE "portal_legal_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"document_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"title" text NOT NULL,
	"version" text NOT NULL,
	"body_text" text NOT NULL,
	"source_file_name" text NOT NULL,
	"source_content_type" text NOT NULL,
	"source_byte_size" integer NOT NULL,
	"source_sha256" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_legal_documents_type_check" CHECK ("portal_legal_documents"."document_type" in ('terms', 'privacy')),
	CONSTRAINT "portal_legal_documents_status_check" CHECK ("portal_legal_documents"."status" in ('active', 'archived')),
	CONSTRAINT "portal_legal_documents_source_byte_size_check" CHECK ("portal_legal_documents"."source_byte_size" > 0),
	CONSTRAINT "portal_legal_documents_source_file_name_length_check" CHECK (length("portal_legal_documents"."source_file_name") between 1 and 180),
	CONSTRAINT "portal_legal_documents_source_content_type_length_check" CHECK (length("portal_legal_documents"."source_content_type") between 1 and 120),
	CONSTRAINT "portal_legal_documents_source_sha256_length_check" CHECK (length("portal_legal_documents"."source_sha256") = 64),
	CONSTRAINT "portal_legal_documents_body_text_not_empty_check" CHECK (length(trim("portal_legal_documents"."body_text")) > 0)
);
--> statement-breakpoint
ALTER TABLE "portal_legal_documents" ADD CONSTRAINT "portal_legal_documents_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_legal_documents_tenant_type_idx" ON "portal_legal_documents" USING btree ("tenant_id","document_type");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_legal_documents_tenant_type_version_unique" ON "portal_legal_documents" USING btree ("tenant_id","document_type","version");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_legal_documents_tenant_type_active_unique" ON "portal_legal_documents" USING btree ("tenant_id","document_type") WHERE "portal_legal_documents"."status" = 'active';
