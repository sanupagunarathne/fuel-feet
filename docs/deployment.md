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

Hosted rollout, billing approval, and provider-specific backup verification remain release gates.

## Release candidate setup

- Build the API with `docker build -t fuel-feet-api .`. Where a trusted package-registry proxy is required, supply its CA bundle as the BuildKit secret `npm_ca`. The certificate is used during package installation. The final image runs the API as the unprivileged Node user.
- Configure Vercel with the repository root as its project root. The checked-in `vercel.json` builds the web workspace and rewrites client routes for deep links. Set the full HTTPS API base URL and the public Supabase settings at build time.
- Configure the API host with the exact Vercel origin, HTTPS Supabase project URL, publishable key, restricted `DATABASE_URL`, and a server-side Storage credential. Use `/api/ready` as the deployment health check. Use the [database connection guide](setup.md) to verify staging.
- Run migrations from an authorized operator session using the direct migration URL. Create and verify the restricted database login. Create a **private** Supabase bucket for receipts and trip sheets, allow only the API's Storage credential to read and upload, and verify an anonymous object request is denied.
- Apply the distance, rates, and advances migration and verify the [per-kilometre financial rules](financial-rules.md#confirmed-trip-calculation) against real trip sheets in staging. Confirm reference scope, payment allocation, and rounding with the owner before enabling real transactions. Configure the actual IOC tariff before real trip confirmation.
- Test with a separate staging owner account. Verify HTTPS, origin restrictions, API access before and after MFA, a sample reconciliation, private attachment access, and the provider's scheduled database and object backups.

## Hosting budget for owner review

For planning, allow roughly USD 52 per month for one Vercel Pro seat, a small always-on Render web service, and one Supabase Pro project. The estimate assumes USD 20, USD 7, and USD 25 respectively. Confirm current quotes, eligible plans, and tax before approval. Set aside a separate budget for off-site storage, backup retention or point-in-time recovery, overages, and email delivery if used. The public pricing pages could not be confirmed from the development environment. [Vercel pricing](https://vercel.com/pricing) · [Render pricing](https://render.com/pricing) · [Supabase pricing](https://supabase.com/pricing)
