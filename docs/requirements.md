# Requirements

## Users and scope

An invited owner uses the application to manage a fuel transportation fleet in Sri Lanka from desktop, tablet, or phone. The initial role is `ADMIN`. Provision accounts privately and require MFA. Future staff roles will be designed against explicit permissions. The business owns the vehicles and is hired to transport IOC-owned fuel. Existing systems continue to handle GPS and fuel monitoring.

## Workflows and acceptance criteria

| Area | Required behavior |
| --- | --- |
| Vehicles | Search and filter by status. Create and edit registration, nickname, make, model, year, notes, and regular crew. Open overview, trips, expenses, and financial history. Mark inactive and preserve all historical records. |
| Employees | Manage names, driver/conductor roles, contacts, default rates, assignments, status, and notes. Keep a separate Employees tab with labels such as `Vehicle registration - Driver` and `Vehicle registration - Conductor`. Give each employee a distinct record so replacing the crew member preserves their pay history. View worked trips, monthly earnings, and payments across vehicles. Allow eligible substitute crew on the trip form. |
| Trips | Enter a date, vehicle, actual crew, reference, revenue, optional distributor and route details, notes, and a supporting file. Suggest regular crew, preview earnings, save drafts, confirm, correct, or void with history. Trap duplicate references and retried submissions. |
| Salaries | Filter by earnings period, employee, role, vehicle where applicable, and payment status. Show each trip's applied basis and rate. Record partial payments with dates and optional references, show balances, and export employee statements. Provide a Record advance action and show each employee’s advances and remaining salary for the month. Show any brought-forward advance balance and carry excess advances into the next month. |
| Expenses | Manage maintenance, repairs, and highway bills with date, amount, description, exactly one vehicle, an optional same-vehicle trip, and a private receipt. Search and filter and show monthly category totals. Record correction reasons. |
| Dashboard | Default to the current Colombo month. Show revenue, operating profit, employee earnings, expenses, active vehicles, and completed trips. Filter by period and vehicle. Show trends, revenue versus expenses, vehicle results, expense mix, recent trips and expenses, and payable salary balances. |
| Reports | Generate vehicle profit, fleet performance, employee earnings, payment history, trip history, vehicle expenses, and category breakdowns. Filter by applicable criteria and download PDF or XLSX. |
| Settings | Manage business name, contact, address, and report preferences. Show LKR, Asia/Colombo, expense categories, rounding policy, salary basis, version, account security, and appearance. Audit settings changes that affect calculations. |
| Documents | Attach and retrieve JPG, PNG, and PDF scans privately. Validate size and signature, provide upload error recovery, and preserve the link to the business record. |
| Operations | Provide HTTPS, private data access, logs with sensitive fields redacted, backups and restore drills, and an operational data export. |

## Owner's daily workflow

- Enter loaded one-way distance and revenue inputs as each trip is completed. The quantity is fixed at 6,600 L for every trip. The planned calculation produces trip revenue and both crew earnings. Record repairs, maintenance, and highway tolls as separate expenses throughout the month.
- Enter a toll only when the vehicle used the highway. Link the expense to the relevant trip when known. A trip without a toll needs no expense entry.
- Keep one IOC tariff for all vehicles and routes, editable by the owner in Settings → Rates. Store changes by effective month and show the current and scheduled rates. Keep one editable company-wide rate for drivers and one for conductors. Apply rate changes from the start of a new month, using the trip month to choose rates. Regular crew remain assigned to their vehicle until a vacancy needs to be filled. Preserve the actual crew and rates applied to confirmed trips. See [confirmed trip calculation](financial-rules.md#confirmed-trip-calculation).
- At month end, review profit for the fleet or for one vehicle and download the Excel report. Keep the dashboard focused on recording trips and expenses and checking the month's totals. Put charts and recent records behind a disclosure.

## Owner decisions

All decisions in this table are open. The development behaviors are proposals for implementation and synthetic tests. Foundation work can proceed while the owner reviews them. Review decisions that affect schema or constraints before finalizing the corresponding migration, particularly reference scope, historical rate selection, and payment allocation.

| Open decision | Proposed development behavior | Resolve before |
| --- | --- | --- |
| Financial rounding | Propose rounding half up to one cent per employee per trip, then summing. | Production trip confirmation |
| Historical crew and rates | Suggest regular crew by trip date when assignment history exists. Require explicit selection when a backdated trip has no applicable assignment. Confirm whether historical rates should follow the trip date or another business date. | Finalizing crew and rate history models |
| Trip reference namespace | Propose distributor plus normalized reference, with vehicle scope for trips without a known distributor. Verify reference reuse, allowable normalization, and how to handle distributor or vehicle corrections. | Production trip entry |
| Payment allocation and overpayments | Propose assigning each payment to one employee and one earnings month. Preserve excess as an explicitly displayed credit for that month, with no automatic transfer. Confirm whether excess payments should instead be rejected and how later transfers are authorized. | Production salary payments |
| Corrections to prior statements | Propose that reports reflect the latest audited records. Confirm whether accounting periods need a close/reopen workflow or issued statement versions. | Production financial reporting |
| Distributor payment timing and tracking | Defer receivables until the owner confirms invoicing, timing, and payment allocation. | Before adding receivables |
| Document and audit retention | Confirm retention, deletion approvals, and disaster recovery targets with the owner. | Production release |

For each accepted decision, record what the owner chose, the approval and effective dates, and whether it applies to existing records. Request anonymized example trip-sheet references and a worked salary calculation to verify the rules before production. Use synthetic fixtures for demonstration and testing, with visible labels in demo views.
