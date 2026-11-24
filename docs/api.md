# REST API

All routes are under `/api`. Health responses expose service status only. Every business, export, and attachment route requires a verified Supabase identity, MFA assurance, and the relevant server-side permission.

Readiness covers migrated database access and Auth configuration. `/me` returns the enabled administrator ID and role after bearer and MFA verification. The API uses cents as decimal integer strings in responses.

| Module | Method and path | Behavior |
| --- | --- | --- |
| Health | `GET /health`, `GET /ready` | Service health and dependency readiness |
| Account | `GET /me` | Active profile and permissions. Authentication and MFA ceremonies run through Supabase. |
| Vehicles | `GET/POST /vehicles`, `GET/PATCH /vehicles/:id` | Search, status, detail and updates |
| Crew | `GET/PUT /vehicles/:id/crew`, `GET /trips/default-crew` | Current assignments, history and atomic assignment change |
| Employees | `GET/POST /employees`, `GET/PATCH /employees/:id` | Search, role, status and employee details |
| Distributors | `GET/POST /distributors`, `PATCH /distributors/:id` | Maintain canonical optional issuers |
| Trips | `GET/POST /trips`, `GET/PATCH /trips/:id` | Date, vehicle, employee and status filtering, details and draft edits |
| Trip earnings preview | `POST /trips/preview`, `POST /trips/:id/preview` | Calculate a preview using validated crew and basis |
| Trip lifecycle | `POST /trips/:id/confirm`, `POST /trips/:id/correct`, `POST /trips/:id/void`, `POST /trips/:id/discard` | Transactional changes and audit history |
| Expenses | `GET/POST /expenses`, `GET/PATCH /expenses/:id`, `POST /expenses/:id/void` | Search by description, filter by date/vehicle/category and patch with audit reason |
| Salaries | `GET /salaries`, `GET /salaries/employees/:id` | Monthly earnings, trips, payments and scoped balances |
| Payments | `GET/POST /salary-payments`, `POST /salary-payments/:id/reverse` | Payment history, allocation and audited reversal |
| Dashboard | `GET /dashboard/summary` | Cards, charts, vehicle comparisons and recent records |
| Reports | `GET /reports/:kind` | `vehicle-profit`, `fleet-profit`, `employee-earnings`, `employee-statement`, `salary-payments`, `vehicle-trips`, `vehicle-expenses`, `expense-breakdown` |
| Attachments | `GET/POST /trips/:id/attachments`, `GET/POST /expenses/:id/attachments`, `GET /attachments/:id/download`, `DELETE /attachments/:id` | Validated multipart upload, authorized download and audited removal |
| Audit | `GET /audit` | Paginated administrator view of immutable audit events |
| Rates | `GET /rates`, `PUT /rates` | View and schedule the shared IOC tariff and crew rates by effective month |
| Settings | `GET/PATCH /settings` | View and update business and report settings with audit |

## Request and response conventions

- Use Zod for body and query validation. Lists use fixed sort orders and applicable filters. Use pagination and a stable ID tie-breaker for record lists.
- Use `month=YYYY-MM` or a date range `from` and `toExclusive`. Validate combinations. Salary balance and payment status filters use a whole earnings month. Payment history can use an actual payment date range. Use named IDs such as `vehicleId` and `employeeId`.
- Accept rupee decimal strings, return explicitly named cents fields as integer strings and rates as basis points. Return report metadata identifying period, applied filters, timezone, currency, and generated timestamp.
- Accept `format=json|pdf|xlsx` for supported report endpoints. Render PDFs with company and period labels, page breaks and table totals. Write XLSX dates and bounded currency values as typed cells, use explicit number formats, and write text fields as text. Keep presentation conversion separate from authoritative totals.
- Send a UUID `Idempotency-Key` for mutations. Resend the same key with the same payload after a transport failure. Use the current version when editing or transitioning a financial record and `updatedAt` when editing a directory record. Require a correction reason when changing confirmed trips or expenses that affect reports.
- Return appropriate HTTP status and a stable response shape such as `{ error: { code, message, fieldErrors, requestId } }`. Use 401 for invalid identity, 403 for missing assurance or permission, 409 for stale writes and duplicate identities, 422 for invalid inputs, and 429 for throttling.

## Financial mutation bodies

- Create a draft with `POST /trips`, the trip details and `loadedDistanceKm` as a decimal string. The server calculates the revenue and crew pay with the applicable rate schedule. Edit it with `PATCH /trips/:id` and `{ version, trip }`.
- Preview a stored draft with `POST /trips/:id/preview` and an empty object. Confirm it with `{ version, preview }`, where `preview` is the digest returned by the server. Confirmation returns a conflict if the applicable calculation changed while it was under review.
- For an audited correction, submit `{ trip }` to the preview route, then submit `{ version, reason, trip, preview }` to the correction route. Void a confirmed trip or expense with `{ version, reason }`.
- Discard a trip draft with `{ version }` after unlinking or voiding any active expenses attached to it. This hides the draft and its documents from active views and frees the trip reference for reuse.
- Correct an expense with `{ version, reason, expense }`. Record a salary advance with `advance: true` on `POST /salary-payments`. Its earnings month must match the payment date. Reverse a payment or advance with `{ reason }`. A replacement is a separate payment with `replacesId`.
- Upload a single `file` field with multipart form data. Active documents are deduplicated by parent and checksum. Storage downloads require administrator access and only return finalized active attachments. Removing an attachment takes it out of the document list and disables downloads through the app. The private object and audit event are retained.
