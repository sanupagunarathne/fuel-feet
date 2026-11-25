ALTER TYPE "fuel_feet"."ExpenseCategory" ADD VALUE 'FUEL';--> statement-breakpoint
CREATE TABLE "fuel_feet"."fuel_prices" (
	"effectiveDate" date PRIMARY KEY NOT NULL,
	"centsPerLitre" bigint NOT NULL,
	CONSTRAINT "fuel_price_positive" CHECK ("fuel_feet"."fuel_prices"."centsPerLitre" > 0)
);
--> statement-breakpoint
ALTER TABLE "fuel_feet"."vehicle_expenses" ADD COLUMN "fuelLitres" numeric(9, 3);--> statement-breakpoint
ALTER TABLE "fuel_feet"."vehicle_expenses" ADD COLUMN "fuelPriceCentsPerLitre" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "one_daily_fuel_expense" ON "fuel_feet"."vehicle_expenses" USING btree ("vehicleId","expenseDate") WHERE NOT "fuel_feet"."vehicle_expenses"."voided" AND "fuel_feet"."vehicle_expenses"."fuelLitres" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "fuel_feet"."vehicle_expenses" ADD CONSTRAINT "daily_fuel_values" CHECK (CASE WHEN "fuel_feet"."vehicle_expenses"."category"::text = 'FUEL'
    THEN "fuel_feet"."vehicle_expenses"."tripId" IS NULL AND "fuel_feet"."vehicle_expenses"."fuelLitres" IS NOT NULL AND "fuel_feet"."vehicle_expenses"."fuelLitres" > 0
      AND "fuel_feet"."vehicle_expenses"."fuelPriceCentsPerLitre" IS NOT NULL AND "fuel_feet"."vehicle_expenses"."fuelPriceCentsPerLitre" > 0
      AND "fuel_feet"."vehicle_expenses"."amountCents" = round("fuel_feet"."vehicle_expenses"."fuelLitres" * "fuel_feet"."vehicle_expenses"."fuelPriceCentsPerLitre")
    ELSE "fuel_feet"."vehicle_expenses"."fuelLitres" IS NULL AND "fuel_feet"."vehicle_expenses"."fuelPriceCentsPerLitre" IS NULL END);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fuel_feet_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON fuel_feet.fuel_prices TO fuel_feet_runtime;
  END IF;
END $$;
