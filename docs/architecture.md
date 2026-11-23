# Architecture

## Workspace and runtime

The repository uses npm workspaces at its existing root.

```text
apps/web         React, TypeScript, Vite, Tailwind, React Router
apps/api         Node.js, TypeScript, Express, Drizzle, PostgreSQL migrations
packages/shared  Zod validation and serializable TypeScript contracts
docs             Requirements, decisions, and operating procedures
```

The web app uses TanStack Query and the shared Zod contract for Express liveness. React Router, Lucide, and Recharts support the Phase 03 shell and sample data views. The fixtures are confined to the frontend and carry a demonstration label in the affected views. Supabase Auth and PostgreSQL are integrated. Later milestones add business forms and private document storage. The proposed hosts are Vercel for the web app, a managed Node host for Express, and Supabase for PostgreSQL, Auth, and Storage.

| Layer | Responsibility |
| --- | --- |
| Routes and controllers | Parse validated requests, invoke services, set responses and export headers |
| Middleware | Verify identity and permissions, validate data, rate limit, correlate requests, and handle errors |
| Domain services | Vehicles and crew, employees, trips and earnings, expenses, salary payments, reports, documents, and settings |
| Database access | Drizzle queries and transactions plus reviewed SQL migrations for PostgreSQL-specific constraints |
| Reporting | Shared read service for dashboard, detail pages, and exports. Pre-aggregate confirmed trips/earnings and vehicle expenses independently before joining. Use a consistent database snapshot for multi-query reports. |

Pino or an equivalent structured logger records request IDs, timings, service errors, and authentication events with sensitive fields redacted. Log allowlisted metadata and keep raw tokens, bodies, document contents, and financial details out of request logs.

Drizzle runs on the PostgreSQL Node driver. It was selected after the cloud environment denied access to the native Prisma schema engine required by Prisma CLI.

## Identity and authorization

1. The owner signs in with Supabase Auth. Disable public signup and use private provisioning. Map the external subject to an enabled `UserProfile` through a unique ID.
2. The frontend completes TOTP enrollment or challenge and sends the Supabase access token over HTTPS. Use a first-party browser client and verify XSS protections, token refresh, and teardown. Keep credentials out of URLs and Vite build output.
3. The API verifies signature, issuer, audience, expiry, and identity with the configured provider and requires verified `aal2` plus an enabled profile with the right permission. Keep authorization policy in one middleware boundary, including exports and attachments. Use a database role with access only to the needed schemas and commands and limit direct browser access to business tables and private storage.
4. Logout clears the UI and TanStack Query cache and revokes refresh sessions through Supabase. Access tokens can remain valid until expiry. Use short token lifetimes and immediate server-side disablement of a profile. Validate session-level revocation against the selected provider and implement a checked session denylist if immediate per-session revocation is required.
5. Restrict CORS to configured origins, enforce body limits, and combine IP and user rate limits as appropriate. Review proxy trust and rate-limit storage for the chosen host before launch. Avoid relying on UI visibility for permissions.

## Integrity and concurrency

Use transactions for confirming or correcting a trip and its earning records, voiding a trip, changing crew, editing expenses, and recording payments and their audit rows. Lock or conditionally update the target version within the transaction. A stale edit returns a conflict and the client reloads before submitting a new correction.

Give create and financial lifecycle mutations an idempotency key scoped by actor and operation. Store a payload digest and result reference transactionally with the mutation. Retry the same request with the same key to retrieve its result. Reject key reuse with a different payload. Unique indexes still enforce business identities across different keys. Return conflicts as recoverable user errors.

Uploads combine PostgreSQL metadata with private storage, which has its own transaction boundary. Verify the parent record and its permissions, enforce size, signature, and allowed MIME type, and use a generated object key. Stage the upload, record a checksum, and commit the link only after storage succeeds. Make retries converge on one linked attachment. Reconcile incomplete stages and orphaned objects after a documented grace period. Retain replaced attachments according to policy. Stream authorized downloads with a safe filename, attachment disposition, and private cache controls. Scan uploads before release to users if supported by the provider or a vetted scanning service. Prefer identical-file deduplication within a single parent record to cross-record deduplication.

## Design risks to validate

| Risk | Planned check |
| --- | --- |
| PostgreSQL pooling | Verify direct migrations and the restricted runtime connection, then test against the chosen production pooler. Test concurrency and failure recovery. |
| Split hosting and managed login | Test origin restrictions, refresh, logout, MFA enforcement, and route protection using actual provider-issued test tokens. |
| Optional distributor | Validate the proposed reference namespaces with the owner. Detect collisions when correction changes scope. |
| Backdated work and historical crew | Define how a trip gets crew and rates when its date precedes current assignments. Confirmed trips keep explicit snapshots. |
| Offset payments and financial reports | Use an explicit earnings month for payment allocation, separate from payment date. Avoid allocating payments across vehicle reports until there is a business rule. |
| Multi-source totals | Test joins with several earnings and expenses per vehicle. Use the same read service for exports and authoritative totals. |
| Database and file recovery | Restore both stores together and verify attachment bytes against recorded checksums. |
