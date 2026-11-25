ALTER TABLE "fuel_feet"."document_attachments" DROP CONSTRAINT "document_attachments_tripId_sha256_unique";--> statement-breakpoint
ALTER TABLE "fuel_feet"."document_attachments" DROP CONSTRAINT "document_attachments_expenseId_sha256_unique";--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_sheets" ADD COLUMN "discarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "active_trip_attachment_checksum" ON "fuel_feet"."document_attachments" USING btree ("tripId","sha256") WHERE status <> 'RETAINED';--> statement-breakpoint
CREATE UNIQUE INDEX "active_expense_attachment_checksum" ON "fuel_feet"."document_attachments" USING btree ("expenseId","sha256") WHERE status <> 'RETAINED';
--> statement-breakpoint
ALTER TABLE fuel_feet.trip_sheets ADD CONSTRAINT only_drafts_can_be_discarded CHECK (NOT discarded OR status = 'DRAFT');
--> statement-breakpoint
DROP INDEX fuel_feet.trip_issuer_reference;
--> statement-breakpoint
DROP INDEX fuel_feet.trip_vehicle_reference_without_issuer;
--> statement-breakpoint
CREATE UNIQUE INDEX trip_issuer_reference ON fuel_feet.trip_sheets ("distributorId", lower(btrim(reference)))
  WHERE "distributorId" IS NOT NULL AND NOT discarded;
--> statement-breakpoint
CREATE UNIQUE INDEX trip_vehicle_reference_without_issuer ON fuel_feet.trip_sheets ("vehicleId", lower(btrim(reference)))
  WHERE "distributorId" IS NULL AND NOT discarded;
