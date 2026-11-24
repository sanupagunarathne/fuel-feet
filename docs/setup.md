# Connect Fuel Feet to a database

Use separate databases for development and real business records. The cloud workspace can run a local PostgreSQL database. Your hosted deployment needs its own Supabase project, credentials, and verification.

## Local PostgreSQL

1. Install Docker and Node using the versions in the [README](../README.md). From the repository root run `npm ci`.
2. Create an ignored `.env.local-db` with `FUEL_FEET_LOCAL_DB_OWNER_PASSWORD` set to a generated password. Start the database.

   ```sh
   docker compose --env-file .env.local-db -f compose.local.yml up -d --wait
   ```

3. Copy `.env.example` to `.env`. Set `DIRECT_DATABASE_URL` to a PostgreSQL URL for `fuel_feet_owner` at `127.0.0.1:55433/fuel_feet`. URL-encode passwords containing URL punctuation. Run `npm run db:migrate`.
4. Open a database shell with `docker compose --env-file .env.local-db -f compose.local.yml exec db psql -U fuel_feet_owner -d fuel_feet`. Run these statements. At the password prompt, choose a different generated password for the application.

   ```sql
   CREATE ROLE fuel_feet_runtime NOLOGIN;
   CREATE ROLE fuel_feet_app LOGIN IN ROLE fuel_feet_runtime;
   \password fuel_feet_app
   \q
   ```

5. Apply [runtime-grants.sql](../apps/api/drizzle/runtime-grants.sql) as the owner. From PowerShell or a POSIX shell, run these commands.

   ```sh
   docker compose --env-file .env.local-db -f compose.local.yml cp apps/api/drizzle/runtime-grants.sql db:/tmp/runtime-grants.sql
   docker compose --env-file .env.local-db -f compose.local.yml exec -T db psql -U fuel_feet_owner -d fuel_feet -v ON_ERROR_STOP=1 -f /tmp/runtime-grants.sql
   ```

6. Set `DATABASE_URL` in `.env` with the `fuel_feet_app` login and its password. Then [configure Supabase Auth and provision the administrator](authentication.md). Run `npm run dev` from the root. Technical readiness is available from `GET /api/ready`.

The Docker database binds to loopback. The named volume persists across container restarts.

## Hosted staging checklist

1. Create or choose an **isolated staging** Supabase project. Save the project URL and publishable key to the relevant web and API settings. Keep connection passwords and privileged Storage credentials in environment settings.
2. Set an encrypted, certificate-verified migration connection and run `npm run db:migrate` from the repository root. Use a connection that supports DDL, such as the provider's direct or session connection. Apply the schema grants and use the restricted application login in the API service.
3. Disable public signup, enable TOTP, and [provision the owner](authentication.md). Create the private `fuel-feet-documents` bucket and give the API its server-side Storage credential. Verify anonymous file requests fail.
4. Configure the web and API hosts using the [deployment guide](deployment.md). Confirm the API environment uses the exact HTTPS frontend origin. Test sign-in, rate setup, and private files in staging.
5. In **Settings → Rates**, enter the exact IOC tariff from a real sheet and its effective month. Driver and conductor fields initially show Rs. 45/km and Rs. 40/km. Compare a worked trip and a monthly statement to the paper records. Verify distance and tariff precision, rounding, and an advance carried into the next month.
6. Confirm hosting costs and approve the rollout. Set up and test [database and document backups](backup-and-recovery.md) on the selected accounts before entering real transactions.
