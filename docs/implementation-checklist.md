# Implementation checklist

| Phase | Status | Deliverable and exit criteria |
| --- | --- | --- |
| 1. Planning | Planning deliverables complete | Inspect the README-only checkout. Document scope, architecture, database, API, UI, financial rules, open decisions, testing and production gates. |
| 2. Foundation | Complete | npm workspaces, strict TypeScript, Vite, Tailwind, Express liveness endpoint, shared Zod contracts, lint, test runners, environment loading and root scripts. Verified clean install, development and built API startup, build, lint, type checks and browser smoke tests. |
| 3. UI foundation | Complete | Responsive sidebar, header, drawer, saved themes, reusable controls and tables, sample record views, period filtering and connection feedback. Verified desktop and mobile layouts and keyboard behavior. |
| 4. Managed authentication | Next | Configure a development Supabase project, private provisioning, user profile authorization, AAL2 enforcement and session flows. Exercise expired and unauthorized sessions. |
| 5. Database | Planned | Implement Prisma models and PostgreSQL migrations, indexes, constraints and runtime roles. Test migration and transactional integrity against PostgreSQL. |
| 6. Business workflows | Planned | Implement vehicles and crew, employees, trip preview and lifecycle, salary calculations and payments, and categories and expenses. Exercise snapshots, corrections, duplicate handling and salary/profit edge cases. |
| 7. Dashboard and exports | Planned | Build the shared reporting queries, dashboard, statements, PDF and XLSX. Reconcile results to source records and verify filtering. |
| 8. Hardening | Planned | Complete private attachments, audit and authorization review, dependency review, accessibility and responsive tests, concurrent mutation tests and an isolated restore drill. |
| 9. Deployment | Requires approval | Resolve release-gating decisions, present costs, and obtain owner approval. Configure hosted services, migrate, verify HTTPS and access, and test backups and recovery. |

## Phase 01 verification

- [x] Record the starting repository state and proposed workspace structure.
- [x] Document workflows, API and page contracts, data relationships, financial rules, and the test and recovery plans.
- [x] Specify expected results for a [synthetic month-end reconciliation](testing.md#synthetic-month-end-reconciliation).
- [x] Separate proposed development behavior from [business decisions requiring owner approval](requirements.md#owner-decisions).

## Next milestone

Start Phase 04 with managed login and MFA against an isolated Supabase project. Replace open demo navigation with an explicit sign-in and protected workspace flow as the identity checks are verified.

- [x] Record the Phase 02 [installation and verification commands](../README.md#local-development).
- [ ] Review reference, rate history, and payment allocation decisions before finalizing the related schema.
- [ ] Record accepted business rules and effective dates before enabling affected production features.
- [ ] Obtain approval for production rollout and recurring costs.
