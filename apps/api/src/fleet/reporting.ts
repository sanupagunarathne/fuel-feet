import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { expenseCategories } from '@fuel-feet/shared';
import type { Router } from 'express';
import { companySettings, employees, salaryPayments, tripEarnings, tripSheets, vehicleExpenses, vehicles } from '../db/schema.js';
import { dateRange, filterQuery, id, invalid, monthStart, period, send } from './common.js';
import type { Transaction } from './common.js';
import type { Database } from './common.js';
import { carryAdvances } from './advances.js';
import { renderExport } from './exports.js';

type Scope = z.infer<typeof filterQuery>;
type Range = ReturnType<typeof period>;
type Reader = Database | Transaction;
type Amount = string | number;
export type Report = {
  title: string;
  company: string;
  range: Range;
  generatedAt: string;
  columns: { label: string; kind?: 'money' | 'date' }[];
  rows: Amount[][];
};

const money = (label: string) => ({ label, kind: 'money' as const });
const date = (label: string) => ({ label, kind: 'date' as const });
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^./, (first) => first.toUpperCase());
const total = (column: Parameters<typeof sql>[1]) => sql<string>`coalesce(sum(${column}), 0)::text`;
const tripFilter = (range: Range, q: Scope) => and(dateRange(tripSheets.tripDate, range),
  q.vehicleId ? eq(tripSheets.vehicleId, q.vehicleId) : undefined);
const expenseFilter = (range: Range, q: Scope) => and(dateRange(vehicleExpenses.expenseDate, range),
  q.vehicleId ? eq(vehicleExpenses.vehicleId, q.vehicleId) : undefined);

function summarize(rows: { trips: number; revenue: bigint; driver: bigint; conductor: bigint; categories: bigint[] }[]) {
  const trips = rows.reduce((value, row) => value + row.trips, 0);
  const revenue = rows.reduce((value, row) => value + row.revenue, 0n);
  const driver = rows.reduce((value, row) => value + row.driver, 0n);
  const conductor = rows.reduce((value, row) => value + row.conductor, 0n);
  const categories = expenseCategories.map((_, index) => rows.reduce((value, row) => value + (row.categories[index] ?? 0n), 0n));
  const expenses = categories.reduce((value, amount) => value + amount, 0n);
  const earnings = driver + conductor;
  const cost = earnings + expenses;
  const profit = revenue - cost;
  const unsignedProfit = profit < 0n ? -profit : profit;
  const margin = revenue === 0n ? null : ((unsignedProfit * 10_000n + revenue / 2n) / revenue)
    .toString().padStart(3, '0').replace(/(\d{2})$/, '.$1');
  return { trips, revenue, driver, conductor, earnings, categories, expenses, cost, profit,
    margin: margin === null ? null : `${profit < 0n && margin !== '0.00' ? '-' : ''}${margin}%` };
}

async function fleet(db: Reader, q: Scope, range: Range) {
  const confirmed = and(tripFilter(range, q), eq(tripSheets.status, 'CONFIRMED'));
  const trips = await db.select({ vehicleId: tripSheets.vehicleId, revenue: total(tripSheets.revenueCents),
    count: sql<number>`count(*)::integer` }).from(tripSheets).where(confirmed).groupBy(tripSheets.vehicleId);
  const earnings = await db.select({ vehicleId: tripSheets.vehicleId, role: tripEarnings.role,
    amount: total(tripEarnings.amountCents) }).from(tripEarnings).innerJoin(tripSheets, eq(tripSheets.id, tripEarnings.tripId))
    .where(confirmed).groupBy(tripSheets.vehicleId, tripEarnings.role);
  const expenses = await db.select({ vehicleId: vehicleExpenses.vehicleId, category: vehicleExpenses.category,
    amount: total(vehicleExpenses.amountCents) }).from(vehicleExpenses)
    .where(and(expenseFilter(range, q), eq(vehicleExpenses.voided, false))).groupBy(vehicleExpenses.vehicleId, vehicleExpenses.category);
  const directory = await db.select({ id: vehicles.id, registration: vehicles.registration, active: vehicles.active })
    .from(vehicles).where(q.vehicleId ? eq(vehicles.id, q.vehicleId) : undefined).orderBy(asc(vehicles.registration));
  const tripTotals = new Map(trips.map((row) => [row.vehicleId, row]));
  const earningTotals = new Map(earnings.map((row) => [`${row.vehicleId}:${row.role}`, BigInt(row.amount)]));
  const expenseTotals = new Map(expenses.map((row) => [`${row.vehicleId}:${row.category}`, BigInt(row.amount)]));
  const rows = directory.map((vehicle) => ({
    ...vehicle,
    ...summarize([{
      trips: tripTotals.get(vehicle.id)?.count ?? 0,
      revenue: BigInt(tripTotals.get(vehicle.id)?.revenue ?? 0),
      driver: earningTotals.get(`${vehicle.id}:DRIVER`) ?? 0n,
      conductor: earningTotals.get(`${vehicle.id}:CONDUCTOR`) ?? 0n,
      categories: expenseCategories.map((category) => expenseTotals.get(`${vehicle.id}:${category}`) ?? 0n),
    }]),
  }));
  return { rows, totals: summarize(rows), activeVehicles: rows.filter((vehicle) => vehicle.active).length };
}

async function salaries(db: Reader, q: Scope, range: Range) {
  const earn = await db.select({ employeeId: tripEarnings.employeeId, amount: total(tripEarnings.amountCents),
    trips: sql<number>`count(*)::integer` }).from(tripEarnings).innerJoin(tripSheets, eq(tripSheets.id, tripEarnings.tripId))
    .where(and(tripFilter(range, q), eq(tripSheets.status, 'CONFIRMED'),
      q.employeeId ? eq(tripEarnings.employeeId, q.employeeId) : undefined)).groupBy(tripEarnings.employeeId);
  const withPayments = !q.vehicleId && Boolean(range.month);
  const employeeScope = q.employeeId ? eq(salaryPayments.employeeId, q.employeeId) : undefined;
  const paid = withPayments ? await db.select({ employeeId: salaryPayments.employeeId, advance: salaryPayments.advance,
    amount: total(salaryPayments.amountCents) }).from(salaryPayments)
    .where(and(eq(salaryPayments.earningsMonth, range.from), eq(salaryPayments.status, 'RECORDED'), employeeScope))
    .groupBy(salaryPayments.employeeId, salaryPayments.advance) : [];
  const earlierAdvances = withPayments ? await db.select({ employeeId: salaryPayments.employeeId,
    month: salaryPayments.earningsMonth, amount: total(salaryPayments.amountCents) }).from(salaryPayments)
    .where(and(eq(salaryPayments.status, 'RECORDED'), eq(salaryPayments.advance, true),
      lt(salaryPayments.earningsMonth, range.from), employeeScope))
    .groupBy(salaryPayments.employeeId, salaryPayments.earningsMonth).orderBy(asc(salaryPayments.earningsMonth)) : [];
  const earliest = earlierAdvances[0]?.month;
  const tripMonth = sql<string>`to_char(${tripSheets.tripDate}, 'YYYY-MM') || '-01'`;
  const earlierEarnings = earliest ? await db.select({ employeeId: tripEarnings.employeeId,
    month: tripMonth, amount: total(tripEarnings.amountCents) }).from(tripEarnings)
    .innerJoin(tripSheets, eq(tripEarnings.tripId, tripSheets.id)).where(and(
      eq(tripSheets.status, 'CONFIRMED'), gte(tripSheets.tripDate, earliest), lt(tripSheets.tripDate, range.from),
      q.employeeId ? eq(tripEarnings.employeeId, q.employeeId) : undefined,
    )).groupBy(tripEarnings.employeeId, tripMonth) : [];
  const broughtForward = carryAdvances(earlierEarnings, earlierAdvances);
  const names = await db.select({ id: employees.id, name: employees.fullName, role: employees.role })
    .from(employees).where(q.employeeId ? eq(employees.id, q.employeeId) : undefined).orderBy(asc(employees.fullName), asc(employees.id));
  const entitlements = new Map(earn.map((row) => [row.employeeId, row]));
  const payments = new Map(paid.filter((row) => !row.advance).map((row) => [row.employeeId, BigInt(row.amount)]));
  const advances = new Map(paid.filter((row) => row.advance).map((row) => [row.employeeId, BigInt(row.amount)]));
  return names.filter((row) => entitlements.has(row.id) || payments.has(row.id) || advances.has(row.id)
    || (broughtForward.get(row.id) ?? 0n) > 0n).map((row) => {
    const earned = BigInt(entitlements.get(row.id)?.amount ?? 0);
    const applied = withPayments ? payments.get(row.id) ?? 0n : null;
    const advance = withPayments ? advances.get(row.id) ?? 0n : null;
    const carriedIn = withPayments ? broughtForward.get(row.id) ?? 0n : null;
    const afterAdvances = earned - (advance ?? 0n) - (carriedIn ?? 0n);
    const carriedOut = withPayments ? (afterAdvances < 0n ? -afterAdvances : 0n) : null;
    const balance = applied === null ? null : (afterAdvances < 0n ? 0n : afterAdvances) - applied;
    const status = balance === null ? '—' : carriedOut && carriedOut > 0n ? 'Advance carried'
      : balance < 0n ? 'Credit' : balance === 0n ? 'Settled' : balance === earned ? 'Unpaid' : 'Partial';
    return { ...row, earned, applied, advance, carriedIn, carriedOut, balance, status, trips: entitlements.get(row.id)?.trips ?? 0 };
  });
}

async function salaryDetail(tx: Reader, q: Scope & { employeeId: string }, range: Range, limit: number, offset: number) {
  const [summary] = await salaries(tx, q, range);
  const trips = await tx.select({ reference: tripSheets.reference, date: tripSheets.tripDate,
    loadedDistanceKm: tripSheets.loadedDistanceKm, ratePerKmCents: tripEarnings.ratePerKmCents,
    basisCents: tripSheets.basisCents, rateBps: tripEarnings.rateBps, amountCents: tripEarnings.amountCents, id: tripSheets.id })
    .from(tripEarnings).innerJoin(tripSheets, eq(tripSheets.id, tripEarnings.tripId)).where(and(
      tripFilter(range, q), eq(tripSheets.status, 'CONFIRMED'), eq(tripEarnings.employeeId, q.employeeId),
    )).orderBy(desc(tripSheets.tripDate), asc(tripSheets.id)).limit(limit).offset(offset);
  const payments = q.vehicleId ? [] : await tx.select().from(salaryPayments).where(and(
    eq(salaryPayments.earningsMonth, range.from), eq(salaryPayments.employeeId, q.employeeId),
  )).orderBy(desc(salaryPayments.paidOn), asc(salaryPayments.id)).limit(limit).offset(offset);
  return { summary: summary ?? null, trips, payments };
}

const financialColumns = [{ label: 'Vehicle' }, { label: 'Trips' }, money('Revenue'), money('Driver costs'), money('Conductor costs'),
  ...expenseCategories.map((category) => money(label(category))), money('Vehicle expenses'), money('Total costs'), money('Operating profit'), { label: 'Margin' }];

const reportKinds = ['vehicle-profit', 'fleet-profit', 'employee-earnings', 'employee-statement', 'salary-payments', 'vehicle-trips', 'vehicle-expenses', 'expense-breakdown'] as const;
type ReportKind = typeof reportKinds[number];
const maxDetails = 5000;

async function report(db: Reader, kind: ReportKind, q: Scope & { category?: typeof expenseCategories[number] }): Promise<Report> {
  const range = period(q);
  const [settings] = await db.select({ name: companySettings.businessName }).from(companySettings);
  const base = { company: settings?.name ?? 'Fuel Feet', range, generatedAt: new Date().toISOString() };
  const rupeeRate = (value: bigint) => `Rs. ${value / 100n}.${String(value % 100n).padStart(2, '0')} / km`;
  const moneyValue = (value: bigint | null) => value === null ? '—' : value.toString();

  switch (kind) {
    case 'vehicle-profit':
    case 'fleet-profit': {
      if (kind === 'vehicle-profit' && !q.vehicleId) invalid('Choose a vehicle.');
      const data = await fleet(db, q, range);
      const rows = [...data.rows, { registration: 'Total', ...data.totals }].map((row) => [
        row.registration, row.trips, row.revenue.toString(), row.driver.toString(), row.conductor.toString(),
        ...row.categories.map(String), row.expenses.toString(), row.cost.toString(), row.profit.toString(), row.margin ?? '—',
      ]);
      return { ...base, title: kind === 'fleet-profit' ? 'Fleet operating statement' : 'Vehicle operating statement', columns: financialColumns, rows };
    }
    case 'employee-earnings': {
      const data = await salaries(db, q, range);
      return { ...base, title: 'Employee earnings', columns: [{ label: 'Employee' }, { label: 'Role' }, { label: 'Trips' },
        money('Earned'), money('Advance in'), money('New advances'), money('Salary paid'), money('Left to pay'), money('Advance out'), { label: 'Status' }],
      rows: data.map((row) => [row.name, label(row.role), row.trips, row.earned.toString(), moneyValue(row.carriedIn), moneyValue(row.advance), moneyValue(row.applied), moneyValue(row.balance), moneyValue(row.carriedOut), row.status]) };
    }
    case 'employee-statement': {
      if (!q.employeeId || !range.month) invalid('Choose an employee and an earnings month.');
      const details = await salaryDetail(db, { ...q, employeeId: q.employeeId }, range, maxDetails + 1, 0);
      if (details.trips.length > maxDetails || details.payments.length > maxDetails) invalid('The statement exceeds 5,000 entries.');
      const [employee] = await db.select({ name: employees.fullName }).from(employees).where(eq(employees.id, q.employeeId));
      if (!employee) invalid('Choose an existing employee.');
      const rows: Amount[][] = [
        ...details.trips.map((trip) => ['Trip', trip.date, trip.reference, trip.loadedDistanceKm ? `${trip.loadedDistanceKm} km` : '—', moneyValue(trip.basisCents),
          trip.ratePerKmCents !== null ? rupeeRate(trip.ratePerKmCents) : `${((trip.rateBps ?? 0) / 100).toFixed(2)}%`, trip.amountCents.toString(), '—']),
        ...details.payments.map((payment) => [payment.advance ? (payment.status === 'REVERSED' ? 'Advance reversed' : 'Advance') : label(payment.status), payment.paidOn, payment.reference ?? '—',
          '—', '—', '—', '—', payment.amountCents.toString()]),
        ['Total', '—', '—', '—', '—', '—', moneyValue(details.summary?.earned ?? 0n), moneyValue(details.summary?.applied ?? null)],
        ['Advance brought forward', '—', '—', '—', '—', '—', '—', moneyValue(details.summary?.carriedIn ?? null)],
        ['New advances', '—', '—', '—', '—', '—', '—', moneyValue(details.summary?.advance ?? null)],
        ['Advance carried forward', '—', '—', '—', '—', '—', '—', moneyValue(details.summary?.carriedOut ?? null)],
        ['Balance', '—', '—', '—', '—', '—', '—', moneyValue(details.summary?.balance ?? null)],
      ];
      return { ...base, title: `Salary statement · ${employee.name}`, columns: [
        { label: 'Record' }, date('Date'), { label: 'Reference' }, { label: 'Loaded distance' }, money('Legacy basis'), { label: 'Rate' }, money('Earned'), money('Paid / balance'),
      ], rows };
    }
    case 'salary-payments': {
      if (q.vehicleId) invalid('Payments are allocated to employees and cannot be filtered by vehicle.');
      const data = await db.select({ payment: salaryPayments, employee: employees.fullName }).from(salaryPayments)
        .innerJoin(employees, eq(employees.id, salaryPayments.employeeId)).where(and(
          q.from || q.toExclusive ? dateRange(salaryPayments.paidOn, range) : eq(salaryPayments.earningsMonth, range.from),
          q.employeeId ? eq(salaryPayments.employeeId, q.employeeId) : undefined,
        )).orderBy(desc(salaryPayments.paidOn), asc(salaryPayments.id)).limit(maxDetails + 1);
      if (data.length > maxDetails) invalid('Narrow the report period to export up to 5,000 rows.');
      return { ...base, title: 'Salary payments', columns: [{ label: 'Employee' }, date('Payment date'), { label: 'Earnings month' },
        money('Payment'), { label: 'Reference' }, { label: 'Type' }, { label: 'Status' }],
      rows: data.map(({ payment, employee }) => [employee, payment.paidOn, payment.earningsMonth.slice(0, 7),
        payment.amountCents.toString(), payment.reference ?? '—', payment.advance ? 'Advance' : 'Salary payment', label(payment.status)]) };
    }
    case 'vehicle-trips': {
      const data = await db.select({ trip: tripSheets, registration: vehicles.registration }).from(tripSheets)
        .innerJoin(vehicles, eq(vehicles.id, tripSheets.vehicleId)).where(and(tripFilter(range, q), eq(tripSheets.status, 'CONFIRMED')))
        .orderBy(desc(tripSheets.tripDate), asc(tripSheets.id)).limit(maxDetails + 1);
      if (data.length > maxDetails) invalid('Narrow the report period to export up to 5,000 rows.');
      return { ...base, title: 'Confirmed trip history', columns: [{ label: 'Trip sheet' }, date('Date'), { label: 'Vehicle' },
        { label: 'Origin' }, { label: 'Destination' }, { label: 'Loaded km' }, { label: 'IOC tariff' }, money('Revenue')],
      rows: data.map(({ trip, registration }) => [trip.reference, trip.tripDate, registration, trip.origin ?? '—', trip.destination ?? '—', trip.loadedDistanceKm ?? '—', trip.iocTariff ?? '—', trip.revenueCents.toString()]) };
    }
    case 'vehicle-expenses': {
      const data = await db.select({ expense: vehicleExpenses, registration: vehicles.registration }).from(vehicleExpenses)
        .innerJoin(vehicles, eq(vehicles.id, vehicleExpenses.vehicleId)).where(and(expenseFilter(range, q), eq(vehicleExpenses.voided, false),
          q.category ? eq(vehicleExpenses.category, q.category) : undefined))
        .orderBy(desc(vehicleExpenses.expenseDate), asc(vehicleExpenses.id)).limit(maxDetails + 1);
      if (data.length > maxDetails) invalid('Narrow the report period to export up to 5,000 rows.');
      return { ...base, title: 'Vehicle expenses', columns: [date('Date'), { label: 'Vehicle' }, { label: 'Category' },
        { label: 'Description' }, money('Amount')], rows: data.map(({ expense, registration }) => [
        expense.expenseDate, registration, label(expense.category), expense.description ?? '—', expense.amountCents.toString(),
      ]) };
    }
    case 'expense-breakdown': {
      const data = await fleet(db, q, range);
      return { ...base, title: 'Expense breakdown', columns: [{ label: 'Category' }, money('Amount')],
        rows: expenseCategories.map((category, index) => [label(category), String(data.totals.categories[index] ?? 0n)]) };
    }
  }
}

export function reportRoutes(router: Router, db: Database) {
  router.get('/dashboard/summary', async (req, res) => {
    const q = filterQuery.parse(req.query);
    const range = period(q);
    const result = await db.transaction(async (tx) => {
      const data = await fleet(tx, q, range);
      const month = range.month ?? range.from.slice(0, 7);
      const monthly = sql<string>`to_char(${tripSheets.tripDate}, 'YYYY-MM')`;
      const trend = await tx.select({ month: monthly, revenue: total(tripSheets.revenueCents) }).from(tripSheets)
        .where(and(dateRange(tripSheets.tripDate, { ...range, from: monthStart(month, -5), toExclusive: monthStart(month, 1) }),
          q.vehicleId ? eq(tripSheets.vehicleId, q.vehicleId) : undefined, eq(tripSheets.status, 'CONFIRMED'))).groupBy(monthly);
      const recentTrips = await tx.select({ id: tripSheets.id, reference: tripSheets.reference, tripDate: tripSheets.tripDate,
        revenueCents: tripSheets.revenueCents, registration: vehicles.registration, status: tripSheets.status })
        .from(tripSheets).innerJoin(vehicles, eq(tripSheets.vehicleId, vehicles.id))
        .where(tripFilter(range, q)).orderBy(desc(tripSheets.tripDate), asc(tripSheets.id)).limit(5);
      const recentExpenses = await tx.select({ id: vehicleExpenses.id, expenseDate: vehicleExpenses.expenseDate,
        amountCents: vehicleExpenses.amountCents, registration: vehicles.registration, category: vehicleExpenses.category })
        .from(vehicleExpenses).innerJoin(vehicles, eq(vehicleExpenses.vehicleId, vehicles.id))
        .where(and(expenseFilter(range, q), eq(vehicleExpenses.voided, false)))
        .orderBy(desc(vehicleExpenses.expenseDate), asc(vehicleExpenses.id)).limit(5);
      const balances = q.vehicleId || !range.month ? [] : await salaries(tx, q, range);
      const payable = q.vehicleId || !range.month ? null : balances.reduce((sum, entry) => sum + (entry.balance && entry.balance > 0n ? entry.balance : 0n), 0n);
      return { ...data, recentTrips, recentExpenses, payable, range,
        trend: Array.from({ length: 6 }, (_, index) => {
          const value = monthStart(month, index - 5).slice(0, 7);
          return { month: value, revenue: trend.find((row) => row.month === value)?.revenue ?? '0' };
        }),
      };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    send(res, result);
  });

  router.get('/salaries', async (req, res) => {
    const q = filterQuery.extend({ role: z.enum(['DRIVER', 'CONDUCTOR']).optional(),
      status: z.enum(['Credit', 'Settled', 'Unpaid', 'Partial', 'Advance carried']).optional() }).parse(req.query);
    if (q.status && q.vehicleId) invalid('Payment status is available for the full employee month.');
    const data = await db.transaction((tx) => salaries(tx, q, period(q, true)), { isolationLevel: 'repeatable read', accessMode: 'read only' });
    send(res, data.filter((row) => (!q.role || row.role === q.role) && (!q.status || row.status === q.status)));
  });

  router.get('/salaries/employees/:id', async (req, res) => {
    const q = { ...filterQuery.parse(req.query), employeeId: id(req.params.id) };
    const range = period(q, true);
    const result = await db.transaction((tx) => salaryDetail(tx, q, range, q.limit, q.offset),
      { isolationLevel: 'repeatable read', accessMode: 'read only' });
    send(res, result);
  });

  router.get('/reports/:kind', async (req, res) => {
    const kind = z.enum(reportKinds).parse(req.params.kind);
    const q = filterQuery.extend({ format: z.enum(['json', 'pdf', 'xlsx']).default('json'), category: z.enum(expenseCategories).optional() }).parse(req.query);
    const data = await db.transaction((tx) => report(tx, kind, q), { isolationLevel: 'repeatable read', accessMode: 'read only' });
    if (q.format === 'json') send(res, data);
    else await renderExport(res, data, q.format, kind);
  });
}
