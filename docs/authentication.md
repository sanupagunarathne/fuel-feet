# Authentication and provisioning

Fuel Feet uses Supabase email/password and TOTP. Complete setup in a separate development project or the local Supabase CLI stack. Supabase issues the identity and manages refresh tokens. The API checks the bearer token with the configured Auth service, checks the issuer, expiry and audience, and requires an enabled administrator profile. The API requires AAL2 by default. The Cloudflare staging Worker sets `REQUIRE_MFA=false` so enabled administrators can use email and password alone. Set `REQUIRE_MFA=true` and redeploy to restore the authenticator prompt.

## Provision a development administrator

1. Enable email/password and TOTP in Supabase Auth. Disable public signup. Create the owner account through the Supabase administrative UI. Use its Auth user UUID in the next step.
2. Configure `DIRECT_DATABASE_URL` for the migration owner and run `npm run db:migrate`. Set up the separate database login as described in the [database guide](database-schema.md).
3. As the database owner, explicitly provision the invited identity. Set `subject` in `psql` to the UUID of the user you created.

   ```sql
   INSERT INTO fuel_feet.user_profiles ("authSubject", role, enabled)
   VALUES (:'subject'::uuid, 'ADMIN', true);
   ```

4. Set the two Supabase URLs and publishable keys in [.env.example](../.env.example)'s corresponding variables in your local `.env`. The web and API point at the same project. The API connects to PostgreSQL with the restricted `DATABASE_URL`. Run `npm run dev`, sign in, and follow the authenticator setup.
5. In Settings, sign out and sign in again to verify the existing authenticator challenge. Test without an enabled profile to confirm workspace access is denied.

Keep passwords, MFA setup keys, privileged provider keys and database credentials out of browser configuration and logs. Use HTTPS for hosted environments. The browser stores the Supabase session using the provider SDK and clears the workspace query cache on sign-out. Sign-out revokes the local refresh session. Disable an administrator's database profile to block access on the next protected API request. Browser access is rechecked on focus and every minute. Test session lifetimes and per-session revocation settings with the selected hosting configuration before launch.

Stage an owner MFA recovery procedure before rollout. Recovery requires a verified administrator with access to the managed provider. The app exposes no self-service privilege grant.

## Preview and readiness

With no provider configuration, set `VITE_DEMO_MODE=true` to view the read-only sample workspace in Vite development. Configured authentication takes precedence and production builds ignore demo mode. The signed-in workspace uses protected API endpoints for real business records.

`GET /api/health` checks process liveness. `GET /api/ready` checks that Auth is configured and the runtime role can query the migrated profile table. Use a protected request during deployment smoke testing to verify connectivity to the identity service itself.
