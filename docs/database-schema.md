# Proposed database schema

Use UUID primary keys for business records, PostgreSQL `DATE` for business dates, `TIMESTAMPTZ` for events, and `BIGINT` for LKR cents. Use `created_at` and `updated_at` on editable entities. Keep foreign keys restrictive for records with historical value. Include explicit SQL migrations for checks and indexes that Prisma cannot express.

| Entity | Main fields and relationships |
| --- | --- |
| UserProfile | Unique Supabase subject, enabled flag, role. Records actor identity for writes and audit logs. |
| Vehicle | Unique normalized registration, nickname, make, model, year, status and notes. Has crew assignments, trips and vehicle expenses. |
| Employee | Full name, driver/conductor role, contact, default rate, status and notes. Has crew assignments, trip earnings and salary payments. Employee vehicle views read from assignments. |
| VehicleCrewAssignment | Vehicle, employee, role, effective date range. Keep historical rows and prevent overlapping assignments for the same vehicle and role. Confirm whether an employee can be regularly assigned to several vehicles. |
| Distributor | Canonical name and status. Optional issuer for trip sheets. Use it to identify the reference namespace once approved. |
| TripSheet | Vehicle, actual driver and conductor, optional distributor, reference and normalized reference, trip date, route, revenue cents, basis policy and amount snapshot, notes, creator, status and version. |
| TripEarning | Trip, employee, crew role, applied rate, amount cents and rounding mode. Unique per trip and role. Creation or recalculation commits with the trip. |
| VehicleExpense | Vehicle, optional related trip, business date, category, amount cents, description, status, actor and version. |
| SalaryPayment | Employee, earnings month, actual payment date, positive amount cents, optional reference and notes, creator and status. Keep reversal metadata and replacement linkage if corrected. |
| DocumentAttachment | Exactly one trip or expense, object key, display filename, verified type, byte size, checksum, lifecycle state and uploader. Preserve attachment history on replacement. |
| CompanySettings | Single-company configuration with business identity and contact, LKR, Asia/Colombo, report preferences and salary policy metadata with revision. |
| AuditLog | Append-only actor, entity type and ID, operation, reason, timestamp, request ID, and allowlisted before/after values. Restrict direct access and include in backups. |
| MutationRequest | Actor and operation scope plus idempotency key, payload digest, result reference, and timestamp. Unique by actor, operation, and key. |

## Constraints and indexes

- Validate role matches and eligibility in the service. Declare unique keys and composite foreign keys where practical to bind an earning to its trip crew and an expense link to a trip of the same vehicle. Keep both crew slots required for confirmation. Correlate trip and earning changes in one transaction.
- Enforce nonnegative trip and expense amounts, positive payments, supported expense categories and rates between 0% and 100%. Use controlled status transitions and reject concurrent stale edits.
- Use separate partial unique indexes for proposed distributor/reference and distributor-absent vehicle/reference scopes. Retain the identity of voided trips and allow reuse only if the approved policy explicitly permits it. Audit reference corrections with prior values and collision checks.
- Index trip date and vehicle/date, confirmed earnings by employee/trip, expense date and vehicle/date, payment employee/earnings month and payment date, and audit entity/timestamp. Evaluate plans with representative data volumes.
- Where assignment history uses half-open effective ranges, prevent overlapping vehicle/role periods with an exclusion constraint or equivalent concurrency-safe transaction. Deactivating a vehicle or employee must preserve referenceability.
- Uniquely identify storage objects and prevent duplicate linked content within a parent. Constrain parent ownership and use an explicit stage, ready, or retained lifecycle.
