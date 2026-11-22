# Development and deployment plan

## Local development

Use the pinned Node and npm versions and root lockfile to build the web and API workspaces. See the [README](../README.md) for installation, validation and startup commands. The liveness check has no external dependencies. The signed-in workflow requires Supabase Auth and a migrated PostgreSQL database.

Configure the API port and allowed web origin at runtime. Vite forwards `/api` to the local API in development. For separate production hosts, set the full `VITE_API_BASE_URL` before building and set `WEB_ORIGIN` to the deployed frontend's exact origin.

For development, use local PostgreSQL and an isolated Supabase project or CLI stack. Provision a dedicated development admin, test MFA, and configure private storage within that environment. Keep privileged credentials in the API or migration process and make sure direct and pooled database URLs target the same environment. See [.env.example](../.env.example) and the [provisioning guide](authentication.md).

## Proposed production services

| Component | Candidate | Evaluate before approval |
| --- | --- | --- |
| Web | Vercel commercial plan | Commercial-use terms, SPA rewrites, environment separation and limits |
| Express | Managed Node web service, with Render as a candidate | Always-on pricing, cold starts by tier, supported Node runtime, region, log retention, TLS and database connectivity |
| PostgreSQL, Auth and Storage | Supabase project with paid backup coverage where required | Region, backup retention and PITR options, MFA and email delivery, private object access, independent storage backups |

Use separate development and production projects and storage buckets. Obtain a current recurring-cost estimate before deployment, including minimum plan fees, compute, database and storage, egress, transactional email if needed, and off-site backups. Confirm limits and retention directly with the providers. The owner approves the service choices, costs, and deployment before production work.

## Release checks

1. Run lint, type checking, tests, builds and dependency review against the release candidate.
2. Verify approved business policies, provision the owner with MFA, validate secrets, and restrict production origins.
3. Validate migrations and restore procedures on a separate environment. Set a pre-migration recovery point.
4. Deploy the approved release, verify HTTPS, check API liveness and readiness, and test login, access controls and private downloads.
5. Verify backup schedules and simulate the operational workflow with approved test data in a separate environment.
6. Document rollback for the prior web/API release and a compatible database version. Use a tested restore or corrective migration when rolling back data changes.

Hosting, billing, migrations, and recovery remain future work.
