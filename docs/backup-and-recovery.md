# Backup and recovery plan

Proposed starting targets are 24 hours maximum data loss, an eight-hour restore target, and 30 days of encrypted daily database and object backup retention. Confirm targets, retention and deletion requirements with the owner before production. Assess PITR if daily backups fail the approved data-loss objective.

## Backup coverage

- Use platform-managed PostgreSQL backups with verified coverage for the selected plan. Schedule an encrypted logical off-site export with schema and data, including audit and attachment metadata. Document which authentication settings and identities are backed up by the provider and how to restore or re-link them without exposing MFA material.
- Copy private document objects to a separately protected off-site store with a manifest of keys, object versions or timestamps, and checksums. Confirm the recovery point includes all metadata-linked objects. Track replacement and retention dates.
- Store credentials and encryption keys separately. Restrict access to approved administrators and backup jobs, use separate permissions for copying and deleting, and alert on failed or stale backups.
- Keep a business data export available for additional record keeping. Database and object recovery remain a separate operational process.

## Restore drill

1. Select a matching database recovery point and file manifest. Provision an isolated restore project with private networking or tightly restricted access.
2. Restore database state and required user profiles. Reconfigure or recover managed identity and ensure recovered accounts can log in privately with MFA.
3. Restore private objects and verify completeness against metadata and file checksums.
4. Run integrity checks, authorize test users, sample authenticated downloads, and reconcile trip counts, salary balances, expenses and monthly profit against source records.
5. Record elapsed time, data loss, verification results and remediation. Run a drill before launch, quarterly thereafter as a proposed cadence, and after material storage changes. For a real incident, approve any cutover before pointing production at the restored services.

## Development restore result

A disposable PostgreSQL 17 backup was restored with `pg_restore` into a fresh database. The check compared Auth users, audit rows, confirmed revenue, crew earnings, expenses, and finalized attachment metadata. A PDF from the browser workflow was copied to a separate private Supabase Storage bucket and verified against the restored SHA-256 checksum. An anonymous request for that object was denied.

A scheduled production backup job and off-site copy must be configured on the approved hosting accounts. Use a separate restore environment to validate those copies and establish actual recovery time and retention. Supabase database backups do not include object bytes. Back up the objects independently while keeping their keys, checksums, and an appropriate recovery window.
