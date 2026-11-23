# Requirements

## Users and scope

An invited owner uses the application to manage a fuel transportation fleet in Sri Lanka from desktop, tablet, or phone. The initial role is `ADMIN`. Provision accounts privately and require MFA. Future staff roles will be designed against explicit permissions. Existing systems continue to handle GPS and fuel monitoring.

## Workflows and acceptance criteria

| Area | Required behavior |
| --- | --- |
| Vehicles | Search and filter by status. Create and edit registration, nickname, make, model, year, notes, and regular crew. Open overview, trips, expenses, and financial history. Mark inactive and preserve all historical records. |
| Employees | Manage names, driver/conductor roles, contacts, default rates, assignments, status, and notes. View worked trips, monthly earnings, and payments across vehicles. Allow eligible substitute crew on the trip form. |
| Trips | Enter a date, vehicle, actual crew, reference, revenue, optional distributor and route details, notes, and a supporting file. Suggest regular crew, preview earnings, save drafts, confirm, correct, or void with history. Trap duplicate references and retried submissions. |
| Salaries | Filter by earnings period, employee, role, vehicle where applicable, and payment status. Show each trip's applied basis and rate. Record partial payments with dates and optional references, show balances, and export employee statements. |
| Expenses | Manage maintenance, repairs, and highway bills with date, amount, description, exactly one vehicle, an optional same-vehicle trip, and a private receipt. Search and filter and show monthly category totals. Record correction reasons. |
| Dashboard | Default to the current Colombo month. Show revenue, operating profit, employee earnings, expenses, active vehicles, and completed trips. Filter by period and vehicle. Show trends, revenue versus expenses, vehicle results, expense mix, recent trips and expenses, and payable salary balances. |
| Reports | Generate vehicle profit, fleet performance, employee earnings, payment history, trip history, vehicle expenses, and category breakdowns. Filter by applicable criteria and download PDF or XLSX. |
| Settings | Manage business name, contact, address, and report preferences. Show LKR, Asia/Colombo, expense categories, rounding policy, salary basis, version, account security, and appearance. Audit settings changes that affect calculations. |
| Documents | Attach and retrieve JPG, PNG, and PDF scans privately. Validate size and signature, provide upload error recovery, and preserve the link to the business record. |
| Operations | Provide HTTPS, private data access, logs with sensitive fields redacted, backups and restore drills, and an operational data export. |

## Owner decisions

All decisions in this table are open. The development behaviors are proposals for implementation and synthetic tests. Foundation work can proceed while the owner reviews them. Review decisions that affect schema or constraints before finalizing the corresponding migration, particularly reference scope, historical rate selection, and payment allocation.

| Open decision | Proposed development behavior | Resolve before |
| --- | --- | --- |
| Gross or adjusted basis | Explicitly label gross revenue as provisional in development. Model gross or a separately entered adjusted amount with a reason. Confirm permitted adjustments and whether adjusted use can exceed gross before enabling adjusted production confirmation. | Production trip confirmation |
| Actual driver and conductor rates | Require explicitly entered rates. Confirm whether zero and unusually high combined rates are allowed under company policy. | Production crew setup |
| Rate scope and effective dates | Use per-employee, role-linked defaults in development. Confirm any vehicle or role overrides, effective dates, precedence, and how backdated trips get their rate. | Production trip confirmation |
| Financial rounding | Propose rounding half up to one cent per employee per trip, then summing. | Production trip confirmation |
| Historical crew and rates | Suggest regular crew by trip date when assignment history exists. Require explicit selection when a backdated trip has no applicable assignment. Confirm whether historical rates should follow the trip date or another business date. | Finalizing crew and rate history models |
| Trip reference namespace | Propose distributor plus normalized reference, with vehicle scope for trips without a known distributor. Verify reference reuse, allowable normalization, and how to handle distributor or vehicle corrections. | Production trip entry |
| Payment allocation and overpayments | Propose assigning each payment to one employee and one earnings month. Preserve excess as an explicitly displayed credit for that month, with no automatic transfer. Confirm whether excess payments should instead be rejected and how later transfers are authorized. | Production salary payments |
| Corrections to prior statements | Propose that reports reflect the latest audited records. Confirm whether accounting periods need a close/reopen workflow or issued statement versions. | Production financial reporting |
| Employee advances and deductions | Defer until rules, source records, and adjustment approvals are agreed. | Before adding this capability |
| Distributor payment timing and tracking | Defer receivables until the owner confirms invoicing, timing, and payment allocation. | Before adding receivables |
| Document and audit retention | Confirm retention, deletion approvals, and disaster recovery targets with the owner. | Production release |

For each accepted decision, record what the owner chose, the approval and effective dates, and whether it applies to existing records. Request anonymized example trip-sheet references and a worked salary calculation to verify the rules before production. Use synthetic fixtures for demonstration and testing, with visible labels in demo views.
