# Financial rules

## Confirmed trip calculation

Owner clarification recorded on 23 November 2026. New trips use this distance-based calculation. Historical percentage-based records retain their original calculation and snapshots.

| Output | Calculation |
| --- | --- |
| Trip revenue | Loaded one-way distance in km × 6,600 L × customer tariff in LKR per litre per km |
| Driver earnings | Loaded one-way distance in km × driver rate in LKR per km |
| Conductor earnings | Loaded one-way distance in km × conductor rate in LKR per km |

The business owns the vehicle and is hired by IOC to transport fuel owned by IOC. The hire charge is transport revenue. Both customer billing and crew pay use the loaded outbound distance. The empty return leg earns no transport revenue or crew pay.

Every trip is billed for 6,600 L. The trip form uses this fixed quantity automatically. Across all vehicles, the current standard rate is Rs. 45/km for every driver and Rs. 40/km for every conductor. For 150 km loaded outbound and 150 km empty on the return, billable distance is 150 km. The driver earns Rs. 6,750.00 and the conductor earns Rs. 6,000.00, for a total crew cost of Rs. 12,750.00. Transport revenue is `990,000 × tariff` in rupees. IOC uses one tariff in LKR per litre per kilometre across all vehicles and routes at any given time. The tariff is a shared, editable setting and can change over time. The driver and conductor rates are separate editable company-wide settings, without per-employee or per-vehicle overrides. Preserve distance, litres, applied tariff, applied crew rates, the actual crew, and calculated amounts on each confirmed trip so later rate and assignment changes preserve historical results.

Record the full trip revenue. Record a highway toll as a separate expense only when incurred. Monthly profit subtracts earned crew costs and recorded vehicle expenses, including any tolls, from trip revenue.

Keep a regular driver and conductor assigned to each vehicle. When an employee leaves, close their assignment and fill the vacant role with the replacement. Prior trips retain their actual crew.

### Monthly rate changes

Rate changes take effect on the first day of the new month in Asia/Colombo. Use the IOC tariff, driver rate, and conductor rate effective for the month the trip was driven, including trips entered later. For example, a November trip entered in December uses November's rates. Keep prior rate schedules and preserve the applied rates on confirmed trips.

In **Settings → Rates**, the owner can enter the IOC tariff in LKR per litre per kilometre, see the current and scheduled rates, and save a change with its effective month. The database stores the IOC tariff as an exact decimal. Trip calculations use the effective schedule, and reports use the confirmed snapshots. Saving a rate change is available at any time and follows the monthly effective-date rule above.

The real IOC tariff still needs to be checked against a trip sheet. Leave it unset until confirmed, show a clear message when a trip has no applicable tariff, and block confirmation until the required rate exists. The implementation supports distance to 3 decimal places and tariff to 12 decimal places. It rounds each calculated amount half up to the nearest cent using exact arithmetic. Verify the input precision and final rounding against a real trip sheet before rollout.

## Amounts, dates, and rates

Store LKR as integer cents. Accept monetary input as plain decimal strings with zero to two decimal places and convert once on the server. Reject invalid precision, signs for nonnegative amounts, exponents, and values above the approved field limit. Use exact integer or decimal arithmetic throughout authoritative calculations. Return minor units as decimal integer strings in JSON, including signed totals. Use `Rs. 50,000.00` in the UI.

For development, represent rates in basis points, with `10.00%` stored as `1000` out of `10000`. Validate `0..10000` per person. Confirm precision, combined-rate policy, and actual rates with the owner.

Use strict ISO calendar dates (`YYYY-MM-DD`) for trip, expense, and payment dates. Interpret the default month and display timestamps in Asia/Colombo. Query date-only ranges with an inclusive start and exclusive end. An inclusive end selected in the UI is advanced by one calendar day before querying.

## Legacy percentage model

- A draft holds selected crew, revenue and proposed basis. Preview uses the server engine and is advisory until confirmation.
- Historical records keep their original gross or adjusted revenue basis.
- For each role, provisional earnings in cents equal `roundHalfUp(basisCents × rateBps ÷ 10000)`. Round once per employee per trip, then sum. The proposed rounding policy requires owner approval.
- Confirmation revalidates the crew and applicable settings. Persist the actual employees, basis type and amount, policy version, exact rates, rounding mode, and earnings atomically. If inputs used by the preview changed, return updated figures for review.
- A confirmed correction requires a reason, records before and after values, and preserves untouched rate and policy snapshots. If actual crew or basis needs to change, show the revised entitlement before applying it and document how replacement rates are selected. A void retains the original trip and earnings for audit and removes the trip and earnings from current reports. Closed-month or published statement restatement policy remains open.

Synthetic rounding vector for tests only. A basis of one cent and a rate of 50% yields one cent using provisional half-up rounding.

## Trip lifecycle

| Starting state | Operation | Financial effect |
| --- | --- | --- |
| Draft | Edit or preview | Save entered values or return a preview. Draft data contributes nothing to reports. |
| Draft | Discard | Hide the draft and its attachments from active views. Retain the audit history and allow the reference to be used again. Any active expense must be unlinked or voided first. |
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

## Employee advances

Record each advance with the employee, date paid, and amount. Show dated entries and the total advances taken by each employee for the selected month. Preserve the employee identity even when their vehicle or role label changes.

The remaining salary before final payment is the month's earned crew pay less new advances and any brought-forward advance balance, with a minimum of zero before other salary payments. For example, Rs. 60,000.00 earned and Rs. 10,000.00 advanced leaves Rs. 50,000.00 before any other salary payments. Apply each advance once. Monthly operating profit uses full earned crew costs, so advances do not add a second expense. When advances exceed monthly earnings, carry the excess forward as an employee advance balance and deduct it from the next month's salary. For example, Rs. 40,000 earned and Rs. 45,000 advanced leaves Rs. 0 to pay that month and Rs. 5,000 to carry forward. Show the brought-forward balance separately from new advances so each payment is applied once.

## Worked earnings and payments

Sum confirmed entitlements for actual crew across vehicles by trip month. Count eligible trips once per employee. Keep profit based on earned salary costs.

For the proposed payment model, record the date money was paid and the earnings month it settles. Payment history can filter by actual date. Monthly earnings statements use payments allocated to the selected earnings month, including payments made later. The signed balance is `earned − net applied payments`. Positive balances are payable, zero balances settled, and negative balances credits. Payable totals sum positive balances and show credits separately so one employee's credit cannot offset another's pay. Proposed statuses are unpaid, partial, settled, and credit. Derive them from amounts rather than elapsed time. Preserve reversals and record replacement payments as separate audited entries.

Build monthly salary balances from employees with earnings or applied payments that month. A payment still appears when a later correction removes all eligible trips. Use whole earnings months for balance and status filters. Custom trip-date ranges can show earned amounts without a balance, since payments are allocated by month.

Vehicle-filtered salary views can show attributed earnings and counts. Payments, balance, and status apply to the full employee and month because no vehicle allocation rule has been confirmed. The UI should clearly scope or hide those values when filtered by vehicle.

## Historical percentage records

The migration preserves existing confirmed percentage-based earnings. To confirm a draft from the earlier version, first enter its loaded one-way distance and review the new calculation.

## Daily running fuel

In **Settings → Fuel prices**, enter the price paid per litre and the date it starts. In **Expenses → Record daily fuel**, enter the bowser, fuel use date, and the day's total litres burned from GPS. Combine multiple journeys for the same bowser on the same day into a single entry.

The system multiplies the GPS litres by the most recent price effective on or before the fuel use date, and rounds the cost to the nearest cent, half up. The original unit price is stored with each entry. Editing litres on the same date keeps the original unit price. Changing the date selects the price applicable to the new date.

Monthly fleet and vehicle profit reports count each active daily fuel entry once as a **Fuel** expense. Trip sheets continue to record IOC revenue and crew earnings separately.
