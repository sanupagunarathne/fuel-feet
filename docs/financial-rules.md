# Financial rules

## Amounts, dates, and rates

Store LKR as integer cents. Accept monetary input as plain decimal strings with zero to two decimal places and convert once on the server. Reject invalid precision, signs for nonnegative amounts, exponents, and values above the approved field limit. Use exact integer or decimal arithmetic throughout authoritative calculations. Return minor units as decimal integer strings in JSON, including signed totals. Use `Rs. 50,000.00` in the UI.

For development, represent rates in basis points, with `10.00%` stored as `1000` out of `10000`. Validate `0..10000` per person. Confirm precision, combined-rate policy, and actual rates with the owner.

Use strict ISO calendar dates (`YYYY-MM-DD`) for trip, expense, and payment dates. Interpret the default month and display timestamps in Asia/Colombo. Query date-only ranges with an inclusive start and exclusive end. An inclusive end selected in the UI is advanced by one calendar day before querying.

## Earnings

- A draft holds selected crew, revenue and proposed basis. Preview uses the server engine and is advisory until confirmation.
- Gross revenue is a **provisional development assumption**. The proposed adjusted mode takes a validated basis amount and a reason. Production confirmation requires an approved basis and rate policy.
- For each role, provisional earnings in cents equal `roundHalfUp(basisCents × rateBps ÷ 10000)`. Round once per employee per trip, then sum. The proposed rounding policy requires owner approval.
- Confirmation revalidates the crew and applicable settings. Persist the actual employees, basis type and amount, policy version, exact rates, rounding mode, and earnings atomically. If inputs used by the preview changed, return updated figures for review.
- A confirmed correction requires a reason, records before and after values, and preserves untouched rate and policy snapshots. If actual crew or basis needs to change, show the revised entitlement before applying it and document how replacement rates are selected. A void retains the original trip and earnings for audit and removes the trip and earnings from current reports. Closed-month or published statement restatement policy remains open.

Synthetic rounding vector for tests only. A basis of one cent and a rate of 50% yields one cent using provisional half-up rounding.

## Trip lifecycle

| Starting state | Operation | Financial effect |
| --- | --- | --- |
| Draft | Edit or preview | Save entered values or return a preview. Draft data contributes nothing to reports. |
| Draft | Confirm | Validate the latest draft, employee roles, reference scope, and applicable policy. Commit the trip, both entitlement rows, and the audit event together. |
| Confirmed | Correct | Require the current version and a reason. For a reference or notes correction, preserve both entitlements. For a financial correction, preview any changed amounts and update the affected snapshots and audit event together. |
| Confirmed | Void | Require a reason and audit the change. Exclude the trip and its entitlements from current reports. Preserve the payment history and any independently recorded vehicle expenses. |
| Voided | View | Show the retained record and reason. A replacement is a separate audited entry, subject to the approved reference reuse policy. |

A report reflects source records as of its generation time under the proposed correction policy. The effect of corrections on previously issued statements requires owner approval.

## Monthly operating results

| Result | Source and calculation |
| --- | --- |
| Completed trips and trip revenue | Count confirmed trips and sum their revenue in the trip-date window |
| Driver and conductor costs | Sum each role's confirmed trip earning snapshots for the same vehicle and trip-date window |
| Vehicle expense totals | Sum valid expenses by expense date and category for the vehicle |
| Total costs | Driver earnings + conductor earnings + maintenance + repairs + highway bills |
| Operating profit | Trip revenue − total costs |
| Operating margin | Operating profit ÷ trip revenue × 100. Show unavailable for zero revenue and preserve negative values. |
| Fleet performance | Sum vehicle totals, including inactive vehicles with applicable activity. Compute margin from fleet totals. |

Use these rules for dashboard cards, trip and expense comparisons, vehicle history, and exports. Vehicle expenses use the expense date even when linked to a trip from another period. A trip void leaves related expenses attributed to their vehicle and date unless explicitly corrected. Each profit statement shows counts, revenue, role costs, category totals, total costs, profit and margin. Label profit as operating profit based on recorded costs.

Treat the active vehicle card as a current-status count for the selected fleet or vehicle. Label it accordingly. Performance comparisons use the selected reporting period and show whether a vehicle had any activity.

## Worked earnings and payments

Sum confirmed entitlements for actual crew across vehicles by trip month. Count eligible trips once per employee. Keep profit based on earned salary costs.

For the proposed payment model, record the date money was paid and the earnings month it settles. Payment history can filter by actual date. Monthly earnings statements use payments allocated to the selected earnings month, including payments made later. The signed balance is `earned − net applied payments`. Positive balances are payable, zero balances settled, and negative balances credits. Payable totals sum positive balances and show credits separately so one employee's credit cannot offset another's pay. Proposed statuses are unpaid, partial, settled, and credit. Derive them from amounts rather than elapsed time. Preserve reversals and record replacement payments as separate audited entries.

Build monthly salary balances from employees with earnings or applied payments that month. A payment still appears when a later correction removes all eligible trips. Use whole earnings months for balance and status filters. Custom trip-date ranges can show earned amounts without a balance, since payments are allocated by month.

Vehicle-filtered salary views can show attributed earnings and counts. Payments, balance, and status apply to the full employee and month because no vehicle allocation rule has been confirmed. The UI should clearly scope or hide those values when filtered by vehicle.

## Configuring the approved basis

For an isolated test environment, set `ALLOW_PROVISIONAL_FINANCE=true` on the API to test gross revenue and half-up calculations. The production process ignores this switch. The deployment operator records the owner's approved basis and increments the policy revision as part of the release process. The settings screen shows policy status. A corrected trip uses its existing policy version and snapshots for unchanged crew. A substitute uses their configured default rate at the time of the correction.
