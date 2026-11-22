# Industrial Slate design system

Use Inter with a system fallback, tabular numbers in currency displays, and restrained shadows. Use emerald for primary actions, selected navigation and positive values. Use a visible label or icon alongside color for losses, pending statuses, and form errors.

| Token | Light | Dark |
| --- | --- | --- |
| Canvas | `#F3F4F6` | `#111827` |
| Card | `#FFFFFF` | `#1F2937` |
| Text | `#111827` | `#F3F4F6` |
| Muted text | `#6B7280` | `#9CA3AF` |
| Border | `#E5E7EB` | `#374151` |
| Sidebar | `#111827` | `#111827` |
| Accent | `#10B981` | `#10B981` |
| Positive | `#059669` | `#34D399` |
| Danger | `#DC2626` | `#DC2626` base |
| Warning | `#D97706` | `#D97706` base |

Verify text and control contrast using actual foreground and background pairs. Use accessible tonal variants for small semantic text and focus indicators where base tokens fall short. Use a dark foreground on emerald actions where required for contrast. On the dashboard, label the active-vehicle count as current and the profitability comparison with its reporting period. When a vehicle filter is applied to salary views, label any displayed payments and balances as employee-wide for the month.

## Page structure

Phase 03 provides the dashboard and read-only sample views for vehicles, trips, employees, salaries, expenses and reports. Settings provides working appearance controls. The selected reporting month travels in the URL. Accounts and record mutations arrive in their respective milestones.

| Route | Page and principal interactions |
| --- | --- |
| `/login`, `/mfa` | Private email/password login and TOTP enrollment or challenge |
| `/` | Dashboard cards, reporting period, recent activity, unpaid balances and financial charts |
| `/vehicles`, `/vehicles/:id` | Directory, crew assignments, status and detail tabs for overview, trips, expenses and financial history |
| `/employees`, `/employees/:id` | Directory and employee details, assignment, rate, worked trips and payment history |
| `/trips`, `/trips/new`, `/trips/:id` | Search and filters, draft/confirm flow, supporting file, corrections and void history |
| `/salaries`, `/salaries/:employeeId` | Earnings-month summary, breakdown, payment dialog and PDF statement. Show the earnings month and actual payment date as separate fields. |
| `/expenses`, `/expenses/new`, `/expenses/:id` | Category totals, list and forms with receipt and optional trip link |
| `/reports` | Accessible report selection, filters, preview and authenticated export |
| `/settings` | Business, salary policy, report defaults, appearance and account |

## Component structure

- `AppShell` composes sidebar, mobile drawer, header, breadcrumbs where useful, visible theme switch, reporting period, account menu, and Quick Add Trip. Preserve reporting filters in the URL where meaningful.
- `PageHeader`, `FilterBar`, `DateRangeControl`, and searchable entity selects keep workflows consistent.
- `MetricCard`, chart panels with tabular summaries, `DataTable`, mobile record cards, status badges and exact currency display present report data.
- `FormField`, `MoneyInput`, date picker, `AttachmentField`, and `ConfirmDialog` support entry and review. Changing a vehicle suggests regular crew and leaves substitute selection available. Show a calculation preview and prompt for confirmation when relevant inputs change.
- `EmptyState`, retryable error panels, loading states and live-region notifications distinguish empty results, failures and successful persisted changes. Disable submit while pending and preserve entered data on recoverable failures.

Persist light, dark or system preference. Apply the effective theme before first paint and listen for system changes in system mode. Test keyboard focus and restoration for drawers and dialogs, usable touch targets, and labels and errors linked to their fields. Reflow layouts on mobile. Use structured cards or intentional, contained scrolling for dense tables and preserve column context.
