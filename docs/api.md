# Planned REST API

All routes are under `/api`. Health responses expose service status only. Every business, export, and attachment route requires a verified Supabase identity, MFA assurance, and the relevant server-side permission.

Phase 02 implements `GET /health`, which reports API liveness with `{"status":"ok"}`. The readiness endpoint and business routes below are planned for later milestones.

| Module | Method and path | Behavior |
| --- | --- | --- |
| Health | `GET /health`, `GET /ready` | Service health and dependency readiness |
| Account | `GET /me` | Active profile and permissions. Authentication and MFA ceremonies run through Supabase. |
| Vehicles | `GET/POST /vehicles`, `GET/PATCH /vehicles/:id` | Search, status, detail and updates |
| Crew | `GET/PUT /vehicles/:id/crew` | Current assignments, history and atomic assignment change |
| Employees | `GET/POST /employees`, `GET/PATCH /employees/:id` | Search, role, status and employee details |
| Distributors | `GET/POST /distributors`, `PATCH /distributors/:id` | Maintain canonical optional issuers |
| Trips | `GET/POST /trips`, `GET/PATCH /trips/:id` | Date, vehicle, employee and status filtering, details and draft edits |
| Trip earnings preview | `POST /trips/preview` | Calculate a preview using validated crew and basis |
| Trip lifecycle | `POST /trips/:id/confirm`, `POST /trips/:id/correct`, `POST /trips/:id/void` | Transactional changes and audit history |
| Expenses | `GET/POST /expenses`, `GET/PATCH /expenses/:id` | Search by description, filter by date/vehicle/category and patch with audit reason |
| Salaries | `GET /salaries`, `GET /salaries/employees/:id` | Monthly earnings, trips, payments and scoped balances |
| Payments | `GET/POST /salary-payments`, `POST /salary-payments/:id/reverse` | Payment history, allocation and audited reversal |
| Dashboard | `GET /dashboard/summary` | Cards, charts, vehicle comparisons and recent records |
| Reports | `GET /reports/:kind` | `vehicle-profit`, `fleet-profit`, `employee-earnings`, `salary-payments`, `vehicle-trips`, `vehicle-expenses`, `expense-breakdown` |
| Attachments | `POST /trips/:id/attachments`, `POST /expenses/:id/attachments`, `GET /attachments/:id/download` | Validated multipart upload and authorized download |
| Settings | `GET/PATCH /settings` | View and update business and report settings with audit |

## Request and response conventions

- Use Zod for body and query validation. Define an allowlist of sort fields and applicable filters. Use pagination and a stable ID tie-breaker for record lists.
- Use `month=YYYY-MM` or a date range `from` and `toExclusive`. Validate combinations. Salary balance and payment status filters use a whole earnings month. Payment history can use an actual payment date range. Use named IDs such as `vehicleId` and `employeeId`.
- Accept rupee decimal strings, return explicitly named cents fields as integer strings and rates as basis points. Return report metadata identifying period, applied filters, timezone, currency, and generated timestamp.
- Accept `format=json|pdf|xlsx` for supported report endpoints. Render PDFs with company and period labels, page breaks and table totals. Write XLSX dates and bounded currency values as typed cells, use explicit number formats, and write text fields as text. Keep presentation conversion separate from authoritative totals.
- Require `Idempotency-Key` on create and financial lifecycle requests. Include the current version when editing or transitioning a record. Require a correction reason when changing confirmed trips or expenses that affect reports.
- Return appropriate HTTP status and a stable response shape such as `{ error: { code, message, fieldErrors, requestId } }`. Use 401 for invalid identity, 403 for missing assurance or permission, 409 for stale writes and duplicate identities, 422 for invalid inputs, and 429 for throttling.
