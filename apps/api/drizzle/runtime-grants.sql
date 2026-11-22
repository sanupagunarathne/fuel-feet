-- Run after migrations, as the migration owner. Create the NOLOGIN group first.
BEGIN;
REVOKE ALL ON SCHEMA fuel_feet FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA fuel_feet FROM PUBLIC;
GRANT USAGE ON SCHEMA fuel_feet TO fuel_feet_runtime;
GRANT SELECT ON fuel_feet.user_profiles TO fuel_feet_runtime;
GRANT SELECT, INSERT, UPDATE ON
  fuel_feet.vehicles, fuel_feet.employees, fuel_feet.vehicle_crew_assignments,
  fuel_feet.distributors, fuel_feet.trip_sheets, fuel_feet.trip_earnings,
  fuel_feet.vehicle_expenses, fuel_feet.salary_payments, fuel_feet.document_attachments,
  fuel_feet.company_settings, fuel_feet.mutation_requests TO fuel_feet_runtime;
GRANT SELECT, INSERT ON fuel_feet.audit_log TO fuel_feet_runtime;
COMMIT;
