CREATE TABLE "fuel_feet"."trip_rate_schedules" (
	"effectiveMonth" date PRIMARY KEY NOT NULL,
	"iocTariff" numeric(18, 12) NOT NULL,
	"driverCentsPerKm" bigint NOT NULL,
	"conductorCentsPerKm" bigint NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_earnings" ALTER COLUMN "rateBps" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fuel_feet"."salary_payments" ADD COLUMN "advance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_earnings" ADD COLUMN "ratePerKmCents" bigint;--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_sheets" ADD COLUMN "loadedDistanceKm" numeric(9, 3);--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_sheets" ADD COLUMN "iocTariff" numeric(18, 12);--> statement-breakpoint
ALTER TABLE "fuel_feet"."trip_sheets" ADD COLUMN "rateEffectiveMonth" date;
--> statement-breakpoint
ALTER TABLE fuel_feet.trip_rate_schedules ADD CONSTRAINT valid_rate_schedule CHECK (
  extract(day FROM "effectiveMonth") = 1 AND "iocTariff" > 0 AND "iocTariff" < 'Infinity'::numeric
  AND "driverCentsPerKm" >= 0 AND "conductorCentsPerKm" >= 0
);
--> statement-breakpoint
ALTER TABLE fuel_feet.salary_payments ADD CONSTRAINT advance_payment_month CHECK (
  NOT advance OR "earningsMonth" = date_trunc('month', "paidOn"::timestamp)::date
);
--> statement-breakpoint
ALTER TABLE fuel_feet.trip_sheets DROP CONSTRAINT trip_snapshot, ADD CONSTRAINT trip_snapshot CHECK (
  ("loadedDistanceKm" IS NULL OR ("loadedDistanceKm" > 0 AND "loadedDistanceKm" < 'Infinity'::numeric))
  AND (status = 'DRAFT' OR (
    "driverId" IS NOT NULL AND "conductorId" IS NOT NULL AND "driverId" <> "conductorId"
    AND (
      ("loadedDistanceKm" IS NULL AND basis IS NOT NULL AND "basisCents" IS NOT NULL AND "policyVersion" IS NOT NULL
        AND ((basis = 'GROSS' AND "basisCents" = "revenueCents")
          OR (basis = 'ADJUSTED' AND nullif(btrim("adjustmentReason"), '') IS NOT NULL)))
      OR ("loadedDistanceKm" IS NOT NULL AND "iocTariff" IS NOT NULL AND "iocTariff" > 0
        AND "rateEffectiveMonth" IS NOT NULL AND extract(day FROM "rateEffectiveMonth") = 1 AND "rateEffectiveMonth" <= "tripDate"
        AND basis IS NULL AND "basisCents" IS NULL AND "policyVersion" IS NULL
        AND "revenueCents" = round("loadedDistanceKm" * 6600 * "iocTariff" * 100))
    )
  ))
);
--> statement-breakpoint
ALTER TABLE fuel_feet.trip_earnings DROP CONSTRAINT valid_earning, ADD CONSTRAINT valid_earning CHECK (
  "amountCents" >= 0 AND rounding = 'HALF_UP' AND (
    ("rateBps" IS NOT NULL AND "rateBps" BETWEEN 0 AND 10000 AND "ratePerKmCents" IS NULL)
    OR ("rateBps" IS NULL AND "ratePerKmCents" IS NOT NULL AND "ratePerKmCents" >= 0)
  )
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fuel_feet.check_trip_earnings(trip_id uuid) RETURNS void
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
        OR "amountCents" IS DISTINCT FROM (CASE WHEN trip."loadedDistanceKm" IS NULL
          THEN round(trip."basisCents"::numeric * "rateBps" / 10000)
          ELSE round(trip."loadedDistanceKm" * "ratePerKmCents") END)
      )
    )
  THEN
    RAISE EXCEPTION 'Trip requires both matching, correctly calculated entitlements' USING ERRCODE = '23514';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fuel_feet_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON fuel_feet.trip_rate_schedules TO fuel_feet_runtime;
  END IF;
END $$;
