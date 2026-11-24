# Fuel Feet development instructions

- Work through the milestones in [docs/implementation-checklist.md](docs/implementation-checklist.md). Use the existing checkout in cloud tasks. Keep changes focused and update the contracts when behavior changes.
- Use strict TypeScript and npm workspaces. Keep React UI, Express services, and shared validation contracts separate. Keep database access, authorization, and authoritative calculations on the server.
- Treat rupees as LKR minor units using integer arithmetic on the server and in PostgreSQL. Send money as strings across JSON. Use date-only values for transaction and reporting dates and Asia/Colombo for business dates. Follow [docs/financial-rules.md](docs/financial-rules.md).
- Check authorization server-side on every protected operation. Use managed Supabase Auth, an explicit admin profile, and verified MFA assurance. Keep privileged credentials in the API environment and sensitive values out of logs.
- Use the [confirmed trip calculation](docs/financial-rules.md#confirmed-trip-calculation) for financial calculations. Preserve historical crew, distance, litres, tariff, applied rates, and earnings on confirmed trips. Make financial corrections explicit, attributed, reasoned, and transactional. Keep salary payments separate from earned salary costs.
- Ship schema changes through version-controlled migrations. Enforce integrity in PostgreSQL where possible and test concurrent requests and rollback on failed mutations.
- Keep documents private. Validate uploads server-side, authorize each download, and document any storage lifecycle change.
- Use isolated test or demo data with clear labels. Obtain explicit approval before production deployment, paid commitments, or changes to production data.
- Run relevant lint, type checks, and tests as executable tooling becomes available. Report what ran and surface failures. Maintain mobile, keyboard, and light and dark theme coverage for affected screens.
