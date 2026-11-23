# Database schema

Use UUID primary keys for business records, PostgreSQL `DATE` for business dates, `TIMESTAMPTZ` for events, and `BIGINT` for LKR cents. Use `created_at` and `updated_at` on editable entities. Keep foreign keys restrictive for records with historical value. Drizzle maps the business tables. Versioned SQL adds integrity checks and indexes that require PostgreSQL-specific DDL.

| Entity | Main fields and relationships |
| --- | --- |
| UserProfile | Unique Supabase subject, enabled flag, role. Records actor identity for writes and audit logs. |
| Vehicle | Unique normalized registration, nickname, make, model, year, status and notes. Has crew assignments, trips and vehicle expenses. |
| Employee | Full name, driver/conductor role, contact, default rate, status and notes. Has crew assignments, trip earnings and salary payments. Employee vehicle views read from assignments. |
| VehicleCrewAssignment | Vehicle, employee, role, effective date range. Keep historical rows and prevent overlapping assignments for the same vehicle and role. Confirm whether an employee can be regularly assigned to several vehicles. |
| Distributor | Canonical name and status. Optional issuer for trip sheets. Use it to identify the reference namespace once approved. |
| TripRateSchedule | First day of effective month, IOC tariff as an exact decimal, and driver and conductor cents per loaded kilometre. |
| TripSheet | Vehicle, actual driver and conductor, optional distributor, reference, trip date, route, loaded distance, applied tariff and rate month, revenue cents, notes, creator, status and version. Legacy records retain the prior revenue basis. |
| TripEarning | Trip, employee, crew role, applied cents per kilometre or legacy percentage rate, amount cents and rounding mode. Unique per trip and role. Creation or recalculation commits with the trip. |
| VehicleExpense | Vehicle, optional related trip, business date, category, amount cents, description, status, actor and version. |
| SalaryPayment | Employee, earnings month, actual payment date, salary or advance indicator, positive amount cents, optional reference and notes, creator and status. Keep reversal metadata and replacement linkage if corrected. |
| DocumentAttachment | Exactly one trip or expense, object key, display filename, verified type, byte size, checksum, lifecycle state and uploader. Preserve attachment history on replacement. |
| CompanySettings | Single-company configuration with business identity and contact, LKR, Asia/Colombo, report preferences and salary policy metadata with revision. |
| AuditLog | Append-only actor, entity type and ID, operation, reason, timestamp, request ID, and allowlisted before/after values. Restrict direct access and include in backups. |
| MutationRequest | Actor and operation scope plus idempotency key, payload digest, result reference, and timestamp. Unique by actor, operation, and key. |

## Constraints and indexes

- Validate crew eligibility in the service. Composite foreign keys enforce employee roles for assignments and earnings and tie each linked expense to a trip on the same vehicle. Deferred constraint triggers require matching entitlements for both crew slots with exact half-up amounts at confirmation commit.
- Enforce nonnegative trip and expense amounts, positive payments, supported expense categories and rates between 0% and 100%. Use controlled status transitions and reject concurrent stale edits.
- Use separate partial unique indexes for proposed distributor/reference and distributor-absent vehicle/reference scopes. Retain the identity of voided trips and allow reuse only if the approved policy explicitly permits it. Audit reference corrections with prior values and collision checks.
- Index trip date and vehicle/date, confirmed earnings by employee/trip, expense date and vehicle/date, payment employee/earnings month and payment date, and audit entity/timestamp. Evaluate plans with representative data volumes.
- Where assignment history uses half-open effective ranges, prevent overlapping vehicle/role periods with an exclusion constraint or equivalent concurrency-safe transaction. Deactivating a vehicle or employee must preserve referenceability.
- Uniquely identify storage objects and prevent duplicate linked content within a parent. Constrain parent ownership and use an explicit stage, ready, or retained lifecycle.

## Migrations and access

Business tables live in the private `fuel_feet` schema. The [versioned SQL migration](../apps/api/drizzle/0000_fleet_schema.sql) creates the tables, indexes, extension and deferred constraints. `DIRECT_DATABASE_URL` connects as a migration owner with permission to create schemas and enable `btree_gist`. `DATABASE_URL` connects as the restricted runtime login.

1. Run `npm run db:migrate` from the repository root against the development database.
2. As an authorized database administrator, create a group role with `CREATE ROLE fuel_feet_runtime NOLOGIN;`. Create a separate login with a securely generated password, and grant membership in `fuel_feet_runtime`. Configure that login in `DATABASE_URL`.
3. Apply [runtime-grants.sql](../apps/api/drizzle/runtime-grants.sql) as the migration owner. The runtime group reads user profiles and can append audit entries. It cannot elevate profiles, modify audit history, delete records, or manage the schema. Keep `fuel_feet` out of the Supabase Data API's exposed schemas.
4. Apply future schema changes through reviewed migrations. `npm run db:generate` generates a Drizzle migration from model changes. Add SQL for constraints and access changes as needed. Keep migration files and their metadata in version control.

Use encrypted PostgreSQL connections with certificate verification in hosted environments. Version 1 stores cents as `BIGINT` and date-only fields as PostgreSQL `DATE`. The initial migration encodes the provisional reference namespace, payment-month allocation and half-up calculation described in the planning documents. Review those rules with the owner before production transactions and use a follow-up migration if they change.
