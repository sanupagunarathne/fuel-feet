import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { ChartNoAxesCombined, CircleDollarSign, ReceiptText, UsersRound } from 'lucide-react';
import { DashboardDetails } from '../components/DashboardDetails';
import { DataTable } from '../components/DataTable';
import { Feedback } from '../components/ui';
import { dateLabel, lkr } from '../lib/format';
import { monthLabel } from '../lib/period';
import { scope, useFleetQuery } from './client';
import { QueryResult } from './components';
import { categories, label } from './fields';
import type { Entity } from './fields';
import { Filter } from './LiveRecords';

const RevenueTrend = lazy(() => import('../components/RevenueTrend'));
type Totals = { revenue: string; earnings: string; profit: string; expenses: string; trips: number; categories: string[] };
type Summary = {
  totals: Totals; activeVehicles: number; payable: string | null;
  rows: ({ id: string; registration: string } & Totals)[];
  trend: { month: string; revenue: string }[];
  recentTrips: { id: string; reference: string; tripDate: string; registration: string; revenueCents: string; status: string }[];
  recentExpenses: { id: string; expenseDate: string; registration: string; category: string; amountCents: string }[];
};

export function LiveDashboard({ period }: { period: string }) {
  const [vehicleId, setVehicleId] = useState('');
  const vehicles = useFleetQuery<Entity[]>('/vehicles?limit=200');
  const summary = useFleetQuery<Summary>(scope('/dashboard/summary', { month: period, vehicleId }));
  const colors = ['var(--chart-maintenance)', 'var(--chart-repairs)', 'var(--chart-tolls)', 'var(--chart-fuel, #8b5cf6)'];
  return <div className="dashboard-grid">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Filter label="Vehicle" value={vehicleId} options={(vehicles.data ?? []).map((row) => ({ value: row.id, label: String(row.registration) }))} onChange={setVehicleId} />
      <Link className="text-link min-h-11" to={scope('/reports', { period, vehicleId })}>Monthly report</Link>
    </div>
    <QueryResult query={summary}>{({ totals, activeVehicles, trend, recentTrips, recentExpenses, rows, payable }) => {
      const metrics = [
        { name: 'Trip revenue', value: totals.revenue, note: `${totals.trips} confirmed trips`, Icon: CircleDollarSign, tone: 'green' },
        { name: 'Operating profit', value: totals.profit, note: 'Based on recorded costs', Icon: ChartNoAxesCombined, tone: 'green' },
        { name: 'Employee earnings', value: totals.earnings, note: 'Drivers and conductors', Icon: UsersRound, tone: 'blue' },
        { name: 'Vehicle expenses', value: totals.expenses, note: 'Fuel, maintenance, repairs and tolls', Icon: ReceiptText, tone: 'amber' },
      ];
      return <>
        <div className="metric-grid">{metrics.map(({ name, value, note, Icon, tone }) => <section className="panel metric-card" key={name}>
          <div className="flex items-center justify-between gap-2"><h2>{name}</h2>
            <span className={`metric-icon metric-icon--${tone}`}><Icon size={18} aria-hidden="true" /></span>
          </div>
          <p className={`metric-amount ${value.startsWith('-') ? 'text-danger' : ''}`}>{lkr(value)}</p><p className="metric-detail">{note}</p>
        </section>)}</div>
        <section className="panel">
          <div className="panel-header"><h2>Vehicle profitability</h2></div>
          <DataTable rows={rows} label="Vehicle profitability" columns={[
            { key: 'registration', label: 'Vehicle', cell: (row) => row.registration },
            { key: 'revenue', label: 'Revenue', cell: (row) => lkr(row.revenue), align: 'right' },
            { key: 'profit', label: 'Operating profit', cell: (row) => <span className={row.profit.startsWith('-') ? 'text-danger' : undefined}>{lkr(row.profit)}</span>, align: 'right' },
          ]} />
        </section>
        <DashboardDetails>
          <div className="chart-grid">
            <section className="panel chart-panel">
              <div className="panel-header chart-heading"><h2>Revenue trend</h2><span className="chart-unit">LKR</span></div>
              <Suspense fallback={<div className="revenue-chart"><Feedback kind="loading" title="Loading revenue chart" /></div>}>
                <RevenueTrend trend={trend.map((item) => ({ month: monthLabel(item.month), revenue: Number(item.revenue) / 100 }))} />
              </Suspense>
            </section>
            <section className="panel">
              <div className="panel-header chart-heading"><h2>Expense breakdown</h2></div>
              <div className="expense-content">
                <div className="expense-bar" aria-hidden="true">{categories.map((category, index) =>
                  <span key={category.value} style={{ background: colors[index], flexGrow: Number(totals.categories[index] ?? 0) }} />)}</div>
                <ul className="expense-legend">{categories.map((category, index) => <li key={category.value}>
                  <span className="legend-dot" style={{ background: colors[index] }} aria-hidden="true" />
                  <span>{category.label}</span><strong>{lkr(totals.categories[index] ?? '0')}</strong>
                </li>)}</ul>
                <p className="fleet-note">Currently active vehicles: {activeVehicles}</p>
                {payable !== null && <p className="mt-2 text-sm">Salary payable · <strong>{lkr(payable)}</strong></p>}
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-header"><h2>Recent trip sheets</h2><Link className="text-link min-h-11" to={scope('/trips', { period, vehicleId })}>View trip sheets</Link></div>
            <DataTable rows={recentTrips} label="Recent trip sheets" columns={[
              { key: 'reference', label: 'Trip sheet', cell: (row) => row.reference },
              { key: 'tripDate', label: 'Date', cell: (row) => dateLabel(row.tripDate) },
              { key: 'registration', label: 'Vehicle', cell: (row) => row.registration },
              { key: 'status', label: 'Status', cell: (row) => label(row.status) },
              { key: 'revenueCents', label: 'Revenue', cell: (row) => row.status === 'DRAFT' ? '—' : lkr(row.revenueCents), align: 'right' },
            ]} />
          </section>
          <section className="panel">
            <div className="panel-header"><h2>Recent expenses</h2><Link className="text-link min-h-11" to={scope('/expenses', { period, vehicleId })}>View expenses</Link></div>
            <DataTable rows={recentExpenses} label="Recent expenses" columns={[
              { key: 'category', label: 'Category', cell: (row) => label(row.category) },
              { key: 'expenseDate', label: 'Date', cell: (row) => dateLabel(row.expenseDate) },
              { key: 'registration', label: 'Vehicle', cell: (row) => row.registration },
              { key: 'amountCents', label: 'Amount', cell: (row) => lkr(row.amountCents), align: 'right' },
            ]} />
          </section>
        </DashboardDetails>
      </>;
    }}</QueryResult>
  </div>;
}
