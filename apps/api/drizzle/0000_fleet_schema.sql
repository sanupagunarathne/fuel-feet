CREATE SCHEMA "fuel_feet";
--> statement-breakpoint
CREATE TYPE "fuel_feet"."AttachmentStatus" AS ENUM('STAGED', 'READY', 'RETAINED');--> statement-breakpoint
CREATE TYPE "fuel_feet"."CrewRole" AS ENUM('DRIVER', 'CONDUCTOR');--> statement-breakpoint
CREATE TYPE "fuel_feet"."EarningsBasis" AS ENUM('GROSS', 'ADJUSTED');--> statement-breakpoint
CREATE TYPE "fuel_feet"."ExpenseCategory" AS ENUM('MAINTENANCE', 'REPAIRS', 'HIGHWAY_BILLS');--> statement-breakpoint
CREATE TYPE "fuel_feet"."PaymentStatus" AS ENUM('RECORDED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "fuel_feet"."TripStatus" AS ENUM('DRAFT', 'CONFIRMED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "fuel_feet"."UserRole" AS ENUM('ADMIN');--> statement-breakpoint
CREATE TABLE "fuel_feet"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actorId" uuid NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"operation" text NOT NULL,
	"reason" text,
	"requestId" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."company_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"businessName" text NOT NULL,
	"contact" text,
	"address" text,
	"currency" text DEFAULT 'LKR' NOT NULL,
	"reportingZone" text DEFAULT 'Asia/Colombo' NOT NULL,
	"basis" "fuel_feet"."EarningsBasis",
	"rounding" text,
	"policyApproved" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"reportSettings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."distributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distributors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."document_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tripId" uuid,
	"expenseId" uuid,
	"uploadedById" uuid NOT NULL,
	"objectKey" text NOT NULL,
	"filename" text NOT NULL,
	"mediaType" text NOT NULL,
	"byteSize" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"status" "fuel_feet"."AttachmentStatus" DEFAULT 'STAGED' NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_attachments_objectKey_unique" UNIQUE("objectKey"),
	CONSTRAINT "document_attachments_tripId_sha256_unique" UNIQUE("tripId","sha256"),
	CONSTRAINT "document_attachments_expenseId_sha256_unique" UNIQUE("expenseId","sha256")
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fullName" text NOT NULL,
	"role" "fuel_feet"."CrewRole" NOT NULL,
	"phone" text,
	"defaultRateBps" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_id_role_unique" UNIQUE("id","role")
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."mutation_requests" (
	"actorId" uuid NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"payloadDigest" char(64) NOT NULL,
	"resultRef" text NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mutation_requests_actorId_operation_key_pk" PRIMARY KEY("actorId","operation","key")
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."salary_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employeeId" uuid NOT NULL,
	"createdById" uuid NOT NULL,
	"earningsMonth" date NOT NULL,
	"paidOn" date NOT NULL,
	"amountCents" bigint NOT NULL,
	"reference" text,
	"notes" text,
	"status" "fuel_feet"."PaymentStatus" DEFAULT 'RECORDED' NOT NULL,
	"reversedAt" timestamp (3) with time zone,
	"reversedById" uuid,
	"reversalReason" text,
	"replacesId" uuid,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_payments_replacesId_unique" UNIQUE("replacesId")
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."trip_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tripId" uuid NOT NULL,
	"employeeId" uuid NOT NULL,
	"role" "fuel_feet"."CrewRole" NOT NULL,
	"rateBps" integer NOT NULL,
	"amountCents" bigint NOT NULL,
	"rounding" text DEFAULT 'HALF_UP' NOT NULL,
	CONSTRAINT "trip_earnings_tripId_role_unique" UNIQUE("tripId","role")
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."trip_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicleId" uuid NOT NULL,
	"driverId" uuid,
	"conductorId" uuid,
	"distributorId" uuid,
	"createdById" uuid NOT NULL,
	"reference" text NOT NULL,
	"tripDate" date NOT NULL,
	"origin" text,
	"destination" text,
	"revenueCents" bigint NOT NULL,
	"basis" "fuel_feet"."EarningsBasis",
	"basisCents" bigint,
	"adjustmentReason" text,
	"policyVersion" integer,
	"notes" text,
	"status" "fuel_feet"."TripStatus" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_sheets_id_vehicleId_unique" UNIQUE("id","vehicleId")
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"authSubject" uuid NOT NULL,
	"role" "fuel_feet"."UserRole" DEFAULT 'ADMIN' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_authSubject_unique" UNIQUE("authSubject")
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."vehicle_crew_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicleId" uuid NOT NULL,
	"employeeId" uuid NOT NULL,
	"role" "fuel_feet"."CrewRole" NOT NULL,
	"startsOn" date NOT NULL,
	"endsBefore" date,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."vehicle_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicleId" uuid NOT NULL,
	"tripId" uuid,
	"createdById" uuid NOT NULL,
	"expenseDate" date NOT NULL,
	"category" "fuel_feet"."ExpenseCategory" NOT NULL,
	"amountCents" bigint NOT NULL,
	"description" text,
	"voided" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_feet"."vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration" text NOT NULL,
	"nickname" text,
	"make" text,
	"model" text,
	"year" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_registration_unique" UNIQUE("registration")
);
--> statement-breakpoint
ALTER TABLE "fuel_feet"."audit_log" ADD CONSTRAINT "audit_log_actorId_user_profiles_id_fk" FOREIGN KEY ("actorId") REFERENCES "fuel_feet"."user_profiles"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."document_attachments" ADD CONSTRAINT "document_attachments_tripId_trip_sheets_id_fk" FOREIGN KEY ("tripId") REFERENCES "fuel_feet"."trip_sheets"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."document_attachments" ADD CONSTRAINT "document_attachments_expenseId_vehicle_expenses_id_fk" FOREIGN KEY ("expenseId") REFERENCES "fuel_feet"."vehicle_expenses"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."document_attachments" ADD CONSTRAINT "document_attachments_uploadedById_user_profiles_id_fk" FOREIGN KEY ("uploadedById") REFERENCES "fuel_feet"."user_profiles"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."mutation_requests" ADD CONSTRAINT "mutation_requests_actorId_user_profiles_id_fk" FOREIGN KEY ("actorId") REFERENCES "fuel_feet"."user_profiles"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."salary_payments" ADD CONSTRAINT "salary_payments_employeeId_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "fuel_feet"."employees"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."salary_payments" ADD CONSTRAINT "salary_payments_createdById_user_profiles_id_fk" FOREIGN KEY ("createdById") REFERENCES "fuel_feet"."user_profiles"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."salary_payments" ADD CONSTRAINT "salary_payments_reversedById_user_profiles_id_fk" FOREIGN KEY ("reversedById") REFERENCES "fuel_feet"."user_profiles"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."salary_payments" ADD CONSTRAINT "salary_payments_replacesId_salary_payments_id_fk" FOREIGN KEY ("replacesId") REFERENCES "fuel_feet"."salary_payments"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_earnings" ADD CONSTRAINT "trip_earnings_tripId_trip_sheets_id_fk" FOREIGN KEY ("tripId") REFERENCES "fuel_feet"."trip_sheets"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_earnings" ADD CONSTRAINT "trip_earnings_employeeId_role_employees_id_role_fk" FOREIGN KEY ("employeeId","role") REFERENCES "fuel_feet"."employees"("id","role") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_sheets" ADD CONSTRAINT "trip_sheets_vehicleId_vehicles_id_fk" FOREIGN KEY ("vehicleId") REFERENCES "fuel_feet"."vehicles"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_sheets" ADD CONSTRAINT "trip_sheets_driverId_employees_id_fk" FOREIGN KEY ("driverId") REFERENCES "fuel_feet"."employees"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_sheets" ADD CONSTRAINT "trip_sheets_conductorId_employees_id_fk" FOREIGN KEY ("conductorId") REFERENCES "fuel_feet"."employees"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_sheets" ADD CONSTRAINT "trip_sheets_distributorId_distributors_id_fk" FOREIGN KEY ("distributorId") REFERENCES "fuel_feet"."distributors"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_sheets" ADD CONSTRAINT "trip_sheets_createdById_user_profiles_id_fk" FOREIGN KEY ("createdById") REFERENCES "fuel_feet"."user_profiles"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."vehicle_crew_assignments" ADD CONSTRAINT "vehicle_crew_assignments_vehicleId_vehicles_id_fk" FOREIGN KEY ("vehicleId") REFERENCES "fuel_feet"."vehicles"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."vehicle_crew_assignments" ADD CONSTRAINT "vehicle_crew_assignments_employeeId_role_employees_id_role_fk" FOREIGN KEY ("employeeId","role") REFERENCES "fuel_feet"."employees"("id","role") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."vehicle_expenses" ADD CONSTRAINT "vehicle_expenses_vehicleId_vehicles_id_fk" FOREIGN KEY ("vehicleId") REFERENCES "fuel_feet"."vehicles"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."vehicle_expenses" ADD CONSTRAINT "vehicle_expenses_tripId_vehicleId_trip_sheets_id_vehicleId_fk" FOREIGN KEY ("tripId","vehicleId") REFERENCES "fuel_feet"."trip_sheets"("id","vehicleId") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "fuel_feet"."vehicle_expenses" ADD CONSTRAINT "vehicle_expenses_createdById_user_profiles_id_fk" FOREIGN KEY ("createdById") REFERENCES "fuel_feet"."user_profiles"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "audit_log_entityType_entityId_createdAt_index" ON "fuel_feet"."audit_log" USING btree ("entityType","entityId","createdAt");--> statement-breakpoint
CREATE INDEX "document_attachments_status_createdAt_index" ON "fuel_feet"."document_attachments" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "salary_payments_employeeId_earningsMonth_index" ON "fuel_feet"."salary_payments" USING btree ("employeeId","earningsMonth");--> statement-breakpoint
CREATE INDEX "salary_payments_paidOn_index" ON "fuel_feet"."salary_payments" USING btree ("paidOn");--> statement-breakpoint
CREATE INDEX "trip_earnings_employeeId_tripId_index" ON "fuel_feet"."trip_earnings" USING btree ("employeeId","tripId");--> statement-breakpoint
CREATE INDEX "trip_sheets_status_tripDate_index" ON "fuel_feet"."trip_sheets" USING btree ("status","tripDate");--> statement-breakpoint
CREATE INDEX "trip_sheets_vehicleId_tripDate_index" ON "fuel_feet"."trip_sheets" USING btree ("vehicleId","tripDate");--> statement-breakpoint
CREATE INDEX "trip_sheets_driverId_tripDate_index" ON "fuel_feet"."trip_sheets" USING btree ("driverId","tripDate");--> statement-breakpoint
CREATE INDEX "trip_sheets_conductorId_tripDate_index" ON "fuel_feet"."trip_sheets" USING btree ("conductorId","tripDate");--> statement-breakpoint
CREATE INDEX "vehicle_crew_assignments_vehicleId_startsOn_index" ON "fuel_feet"."vehicle_crew_assignments" USING btree ("vehicleId","startsOn");--> statement-breakpoint
CREATE INDEX "vehicle_crew_assignments_employeeId_startsOn_index" ON "fuel_feet"."vehicle_crew_assignments" USING btree ("employeeId","startsOn");--> statement-breakpoint
CREATE INDEX "vehicle_expenses_expenseDate_category_index" ON "fuel_feet"."vehicle_expenses" USING btree ("expenseDate","category");--> statement-breakpoint
CREATE INDEX "vehicle_expenses_vehicleId_expenseDate_index" ON "fuel_feet"."vehicle_expenses" USING btree ("vehicleId","expenseDate");--> statement-breakpoint
CREATE INDEX "vehicle_expenses_tripId_vehicleId_index" ON "fuel_feet"."vehicle_expenses" USING btree ("tripId","vehicleId");
--> statement-breakpoint
-- The application schema is private. Grant runtime access separately after migration.
REVOKE ALL ON SCHEMA fuel_feet FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA fuel_feet FROM PUBLIC;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE fuel_feet.vehicle_crew_assignments
  ADD CONSTRAINT crew_assignment_valid_dates
    CHECK ("endsBefore" IS NULL OR "endsBefore" > "startsOn"),
  ADD CONSTRAINT crew_assignment_no_overlap
    EXCLUDE USING gist ("vehicleId" WITH =, role WITH =, daterange("startsOn", "endsBefore", '[)') WITH &&);
--> statement-breakpoint
ALTER TABLE fuel_feet.vehicles ADD CONSTRAINT valid_registration CHECK (btrim(registration) <> '');
--> statement-breakpoint
CREATE UNIQUE INDEX vehicles_registration_normalized ON fuel_feet.vehicles (upper(btrim(registration)));
--> statement-breakpoint
ALTER TABLE fuel_feet.employees ADD CONSTRAINT valid_employee CHECK (
  btrim("fullName") <> '' AND "defaultRateBps" BETWEEN 0 AND 10000
);
--> statement-breakpoint
ALTER TABLE fuel_feet.trip_sheets
  ADD CONSTRAINT trip_values CHECK (
    btrim(reference) <> '' AND "revenueCents" >= 0 AND version > 0
    AND ("basisCents" IS NULL OR "basisCents" >= 0)
    AND ("policyVersion" IS NULL OR "policyVersion" > 0)
  ),
  ADD CONSTRAINT trip_snapshot CHECK (
    status = 'DRAFT' OR (
      "driverId" IS NOT NULL AND "conductorId" IS NOT NULL AND "driverId" <> "conductorId"
      AND basis IS NOT NULL AND "basisCents" IS NOT NULL AND "policyVersion" IS NOT NULL
      AND ((basis = 'GROSS' AND "basisCents" = "revenueCents")
        OR (basis = 'ADJUSTED' AND nullif(btrim("adjustmentReason"), '') IS NOT NULL))
    )
  );
--> statement-breakpoint
-- Provisional issuer/reference policy. Voids keep the reserved reference.
CREATE UNIQUE INDEX trip_issuer_reference ON fuel_feet.trip_sheets ("distributorId", lower(btrim(reference)))
  WHERE "distributorId" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX trip_vehicle_reference_without_issuer ON fuel_feet.trip_sheets ("vehicleId", lower(btrim(reference)))
  WHERE "distributorId" IS NULL;
--> statement-breakpoint
ALTER TABLE fuel_feet.trip_earnings ADD CONSTRAINT valid_earning CHECK (
  "rateBps" BETWEEN 0 AND 10000 AND "amountCents" >= 0 AND rounding = 'HALF_UP'
);
--> statement-breakpoint
-- A non-draft trip and both entitlements are validated together at transaction commit.
CREATE FUNCTION fuel_feet.check_trip_earnings(trip_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, fuel_feet AS $$
DECLARE
  trip fuel_feet.trip_sheets%ROWTYPE;
BEGIN
  SELECT * INTO trip FROM fuel_feet.trip_sheets WHERE id = trip_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF trip.status = 'DRAFT' THEN
    IF EXISTS (SELECT 1 FROM fuel_feet.trip_earnings WHERE "tripId" = trip_id) THEN
      RAISE EXCEPTION 'Draft trips cannot have entitlements' USING ERRCODE = '23514';
    END IF;
    RETURN;
  END IF;

  IF (SELECT count(*) FROM fuel_feet.trip_earnings WHERE "tripId" = trip_id) <> 2
    OR EXISTS (
      SELECT 1 FROM fuel_feet.trip_earnings
      WHERE "tripId" = trip_id AND (
        "employeeId" IS DISTINCT FROM (CASE role WHEN 'DRIVER' THEN trip."driverId" ELSE trip."conductorId" END)
        OR "amountCents" <> round(trip."basisCents"::numeric * "rateBps" / 10000)
      )
    )
  THEN
    RAISE EXCEPTION 'Trip requires both matching, correctly calculated entitlements' USING ERRCODE = '23514';
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION fuel_feet.check_trip_earnings_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, fuel_feet AS $$
BEGIN
  IF TG_TABLE_NAME = 'trip_sheets' THEN
    PERFORM fuel_feet.check_trip_earnings(NEW.id);
  ELSE
    IF TG_OP <> 'DELETE' THEN PERFORM fuel_feet.check_trip_earnings(NEW."tripId"); END IF;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD."tripId" <> NEW."tripId") THEN
      PERFORM fuel_feet.check_trip_earnings(OLD."tripId");
    END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER verify_trip_entitlements_from_trip
AFTER INSERT OR UPDATE ON fuel_feet.trip_sheets DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fuel_feet.check_trip_earnings_change();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER verify_trip_entitlements_from_earning
AFTER INSERT OR UPDATE OR DELETE ON fuel_feet.trip_earnings DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fuel_feet.check_trip_earnings_change();
--> statement-breakpoint
ALTER TABLE fuel_feet.vehicle_expenses ADD CONSTRAINT expense_values CHECK ("amountCents" >= 0 AND version > 0);
--> statement-breakpoint
ALTER TABLE fuel_feet.salary_payments ADD CONSTRAINT salary_payment_values CHECK (
  "amountCents" > 0 AND extract(day FROM "earningsMonth") = 1 AND "replacesId" IS DISTINCT FROM id
  AND ((status = 'RECORDED' AND num_nonnulls("reversedAt", "reversedById", "reversalReason") = 0)
    OR (status = 'REVERSED' AND "reversedAt" IS NOT NULL AND "reversedById" IS NOT NULL
      AND nullif(btrim("reversalReason"), '') IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE fuel_feet.document_attachments ADD CONSTRAINT valid_attachment CHECK (
  num_nonnulls("tripId", "expenseId") = 1 AND "byteSize" > 0
  AND "mediaType" IN ('application/pdf', 'image/jpeg', 'image/png') AND sha256 ~ '^[0-9a-f]{64}$'
);
--> statement-breakpoint
ALTER TABLE fuel_feet.company_settings ADD CONSTRAINT company_settings_values CHECK (
  id = 1 AND currency = 'LKR' AND "reportingZone" = 'Asia/Colombo' AND revision > 0
  AND (NOT "policyApproved" OR (basis IS NOT NULL AND rounding IS NOT NULL AND rounding = 'HALF_UP'))
);
--> statement-breakpoint
ALTER TABLE fuel_feet.mutation_requests ADD CONSTRAINT valid_mutation_request CHECK (
  btrim(key) <> '' AND length(key) <= 200 AND "payloadDigest" ~ '^[0-9a-f]{64}$'
);
