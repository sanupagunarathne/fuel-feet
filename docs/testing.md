# Testing strategy

Run `npm test` for the current Vitest unit and Supertest HTTP coverage. It checks shared response validation, API environment validation, liveness, CORS, the structured 404 response, and authentication and MFA enforcement. Run `npm run test:e2e` with Chromium installed to check live API connection and retry, Colombo month boundaries and filter persistence, keyboard operation of the mobile drawer, table search and viewport containment, and saved and system theme behavior. The [README](../README.md) covers browser setup.

## Tests with isolated services

- Run `npm run db:migrate` against a fresh PostgreSQL database, rerun it to verify repeatability, and apply the runtime grants. Set `FUEL_FEET_TEST_DATABASE_URL` to the isolated migration-owner connection and run `npm run test:db`. This test switches to the runtime role and rolls back its synthetic fixtures.
- Provision a fresh administrator in a disposable Supabase project or local service using the [authentication guide](authentication.md). Export the web and API Supabase variables and the runtime `DATABASE_URL`. Set `FUEL_FEET_AUTH_E2E=true`, `FUEL_FEET_AUTH_E2E_EMAIL` and `FUEL_FEET_AUTH_E2E_PASSWORD` securely in the test process and run `npm run test:e2e`. This exercises enrollment, return to a protected deep link, sign-out and a subsequent authenticator challenge. Provision a fresh fixture before rerunning because enrollment changes the test account.

## Fleet workflows

Run `npm run test:fleet` with `FUEL_FEET_TEST_DATABASE_URL` and `FUEL_FEET_TEST_RUNTIME_URL` set to a disposable migrated database with runtime grants. It inserts synthetic records, races duplicate submissions, reconciles reports, reads the exported workbook, validates the PDF, and exercises private documents against an isolated storage adapter.

To run the browser business workflow, also provision a second fresh administrator and set `FUEL_FEET_WORKFLOW_EMAIL`, `FUEL_FEET_WORKFLOW_PASSWORD` and `ALLOW_PROVISIONAL_FINANCE=true` in the isolated test process. Set `SUPABASE_STORAGE_KEY` and provision a private test bucket to cover browser upload and download. The browser test creates a vehicle, assigns crew, confirms a trip, records a toll, and compares the dashboard and report before downloading both formats. The test ends at a phone-sized viewport in dark mode.

## Coverage plan

Financial and business browser scenarios use deterministic synthetic records in an isolated test environment.

| Layer | Scenarios |
| --- | --- |
| Unit | Parse valid monetary strings and reject invalid amounts and precision. Test zero revenue, rounding ties and high valid amounts, distinct driver and conductor rates, provisional and adjusted basis, month boundaries, negative profit, zero-revenue margin, category and fleet rollups, partial payments, overpayments and cross-month allocations. |
| Database and API integration | Create employees and vehicles, assign crew, save and confirm a trip, calculate and snapshot earnings, add and correct expenses, record and reverse payments, and compare reported totals against source records. Exercise substitutions for both roles, employees working on multiple vehicles, changes to rates and crew, expense-only and inactive vehicles, confirmed corrections, voids, and same-vehicle expense links. |
| Reliability and security | Race duplicate references, idempotency keys, stale edits and concurrent confirmation. Verify transaction rollback, denied access with absent, expired or wrong tokens, wrong roles or missing MFA, and disabled users. Reject invalid/oversized uploads, protect downloads, and reconcile retry and partial upload failures. |
| Report integration | Compare JSON, PDF and XLSX against shared backend aggregates, including date filters and employee payments. Assert workbook cell types and PDF period, pagination and totals. Test a fleet with multiple trips and expenses per vehicle for fan-out. |
| End to end | Sign in as a provisioned test admin with MFA, create crew and a vehicle, assign regular crew, add a completed trip, verify earnings, add a highway bill, verify operating profit, and export the report. Test receipt retrieval, logout, and a protected route after logout. |
| UX | Test light, dark and system mode before and after reload. Test keyboard navigation, focus handling, form errors, retries and mobile widths for financial views, forms and navigation. |

Use a disposable PostgreSQL database with migrations, temporary test storage or an isolated Supabase bucket, and verified provider-issued tokens for managed auth acceptance. Check results and report executed, failed and skipped suites separately. Add CI jobs for lint, type checks, unit and integration tests, and document how to run the browser suite locally or in CI.

## Synthetic month-end reconciliation

Use this scenario in future integration and export tests. Amounts are shown in LKR and use the provisional gross-revenue and rounding rules.

| Vehicle | Trip date | Gross revenue | Driver earnings | Conductor earnings | Dated expenses |
| --- | --- | ---: | ---: | ---: | --- |
| A | 30 April 2026 | 50,000.00 | 5,000.00 at 10% | 2,500.00 at 5% | 2,500.00 maintenance, 1,000.00 repairs, 500.00 highway bills in April |
| B | 30 April 2026 | 20,000.00 | 2,000.00 at 10% for the same driver | 800.00 at 4% for a substitute | 20,000.00 repairs in April |
| C | No trip | 0.00 | 0.00 | 0.00 | 600.00 highway bills in April |

Add a draft trip in April and a confirmed trip on 1 May. April includes exactly two confirmed trips, 70,000.00 revenue, 10,300.00 in crew earnings, and 24,600.00 in expenses. Vehicle profit is 38,500.00 for A, −2,800.00 for B, and −600.00 for C. Fleet profit is 35,100.00. Vehicle C's margin is unavailable. Verify the same source totals in the dashboard, vehicle and fleet reports, PDF, and XLSX.

Record payments of 4,000.00 on 30 April and 1,000.00 on 5 May for the same driver's April earnings. April shows 7,000.00 earned, 5,000.00 applied, and 2,000.00 still payable for that driver. April payment history filtered by actual payment date shows 4,000.00. Total April salaries payable are 5,300.00. An additional April payment allocation of 2,500.00 creates a 500.00 driver credit under the proposed overpayment rule and leaves 3,300.00 payable to conductors. Operating profit stays at 35,100.00 throughout.

Then change the driver's default rate and correct only Vehicle A's trip reference. Both April entitlements for that driver remain stable. Void Vehicle B's trip with a reason. Fleet profit becomes 17,900.00 because the repair expense remains. The original trip and earnings remain available for audit.
