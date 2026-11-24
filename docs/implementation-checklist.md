# Implementation checklist

| Phase | Status | Deliverable and exit criteria |
| --- | --- | --- |
| 1. Planning | Planning deliverables complete | Inspect the README-only checkout. Document scope, architecture, database, API, UI, financial rules, open decisions, testing and production gates. |
| 2. Foundation | Complete | npm workspaces, strict TypeScript, Vite, Tailwind, Express liveness endpoint, shared Zod contracts, lint, test runners, environment loading and root scripts. Verified clean install, development and built API startup, build, lint, type checks and browser smoke tests. |
| 3. UI foundation | Complete | Responsive sidebar, header, drawer, saved themes, reusable controls and tables, sample record views, period filtering and connection feedback. Verified desktop and mobile layouts and keyboard behavior. |
| 4. Managed authentication | Complete in development | Supabase email/password sign-in, private provisioning, TOTP enrollment and challenge, administrator authorization, and sign-out. Tested with a disposable Supabase Auth service. |
| 5. Database | Complete in development | Drizzle models, versioned PostgreSQL migrations, indexes, deferred earnings constraints, and restricted runtime grants. Verified repeat application and database integrity. |
| 6. Business workflows | Verified in development | Protected vehicles, employees, effective-dated crew, trips, expenses and salary payments. Exercised snapshot preservation, correction, duplicate races and cross-month allocation. |
| 7. Dashboard and exports | Verified in development | Live dashboard and report views, vehicle and employee statements, PDF and XLSX. Reconciled the dashboard and export totals to stored records. |
| 8. Hardening | Verified in development | Private attachments, administrator audit history, dependency audit, browser tests, a concurrent submission test, and an isolated database and private-object restore. |
| 9. Deployment | Prepared for review | API container, Vercel build config and hosted rollout checklist prepared. Owner approval, confirmed pricing and policies, provider provisioning, staging validation and hosted rollout are pending. |

## Phase 01 verification

- [x] Record the starting repository state and proposed workspace structure.
- [x] Document workflows, API and page contracts, data relationships, financial rules, and the test and recovery plans.
- [x] Specify expected results for a [synthetic month-end reconciliation](testing.md#synthetic-month-end-reconciliation).
- [x] Separate proposed development behavior from [business decisions requiring owner approval](requirements.md#owner-decisions).

## Next milestone

Configure hosted staging using the [database connection guide](setup.md). Enter the exact IOC tariff and verify worked trips and salary statements before proceeding with the [deployment plan](deployment.md).

- [x] Record the Phase 02 [installation and verification commands](../README.md#local-development).
- [ ] Review reference, rate history and payment allocation before accepting real transactions. Apply a follow-up migration if the provisional database rules change.
- [x] Record confirmed distance-based revenue and crew-pay formulas.
- [x] Implement and verify the new formulas with effective-month rate schedules in development.
- [x] Add employee assignment labels and dated salary advances. Verify month-end balances and operating profit in development.
- [ ] Verify actual tariff precision, rounding, and advance settlement against the owner’s trip and salary records in staging.
- [ ] Obtain approval for production rollout and recurring costs.
