import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, ChartNoAxesCombined, CircleDollarSign, ReceiptText, Truck, UsersRound } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { Feedback } from '../components/ui';
import { demoPeriod, demoSnapshots, demoTrips } from '../demo/fixtures';
import { lkr } from '../lib/format';
import { monthLabel } from '../lib/period';
import { tripColumns } from './Records';

const expenseCategories = [
  { label: 'Maintenance', color: 'var(--chart-maintenance)' },
  { label: 'Repairs', color: 'var(--chart-repairs)' },
  { label: 'Highway bills', color: 'var(--chart-tolls)' },
];

const RevenueTrend = lazy(() => import('../components/RevenueTrend'));

export function Dashboard({ period, search }: { period: string; search: string }) {
  const snapshot = demoSnapshots.find((record) => record.period === period);
  if (!snapshot) {
    return <section className="panel"><Feedback kind="empty" title="No sample figures for this period"
      description="Choose one of the six most recent reporting months." /></section>;
  }

  const trend = demoSnapshots.filter((record) => record.period <= period).reverse().map((record) => ({
    month: monthLabel(record.period),
    revenue: Number(record.revenue) / 100,
  }));

  const metrics = [
    { label: 'Trip revenue', cents: snapshot.revenue, Icon: CircleDollarSign, iconTone: 'green', detail: `${snapshot.trips} confirmed trips` },
    { label: 'Operating profit', cents: snapshot.profit, Icon: ChartNoAxesCombined, iconTone: 'green', detail: 'After crew and vehicle costs' },
    { label: 'Employee earnings', cents: snapshot.earnings, Icon: UsersRound, iconTone: 'blue', detail: 'Drivers and conductors' },
    { label: 'Vehicle expenses', cents: snapshot.expenses, Icon: ReceiptText, iconTone: 'amber', detail: 'Maintenance, repairs and tolls' },
  ];

  return (
    <div className="dashboard-grid">
      <div className="metric-grid">
        {metrics.map(({ label, cents, Icon, iconTone, detail }) => (
          <section className="panel metric-card" key={label}>
            <div className="flex items-center justify-between gap-2">
              <h2>{label}</h2>
              <div className={`metric-icon metric-icon--${iconTone}`}><Icon size={18} aria-hidden="true" /></div>
            </div>
            <p className="metric-amount">{lkr(cents)}</p>
            <p className="metric-detail">{detail}</p>
          </section>
        ))}
      </div>
      <div className="chart-grid">
        <section className="panel chart-panel">
          <div className="panel-header chart-heading">
            <div>
              <h2>Revenue trend</h2>
              <p className="panel-subtitle">Confirmed trip revenue by month</p>
            </div>
            <span className="chart-unit">LKR</span>
          </div>
          <Suspense fallback={<div className="revenue-chart"><Feedback kind="loading" title="Loading revenue chart" /></div>}>
            <RevenueTrend trend={trend} />
          </Suspense>
        </section>
        <section className="panel expense-panel">
          <div className="panel-header chart-heading"><div>
            <h2>Expense breakdown</h2>
            <p className="panel-subtitle">Vehicle costs by category</p>
          </div></div>
          <div className="expense-content">
            <div className="expense-bar" aria-hidden="true">
              {expenseCategories.map(({ label, color }, index) => (
                <span key={label} style={{ background: color, flexGrow: Number(snapshot.categories[index]) }} />
              ))}
            </div>
            <ul className="expense-legend">
              {expenseCategories.map(({ label, color }, index) => (
                <li key={label}>
                  <span className="legend-dot" style={{ background: color }} aria-hidden="true" />
                  <span>{label}</span>
                  <strong>{lkr(snapshot.categories[index] ?? '0')}</strong>
                </li>
              ))}
            </ul>
            <div className="fleet-note"><Truck size={17} aria-hidden="true" /> <span>{snapshot.vehicles} active vehicles</span></div>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>Recent trip sheets</h2>
          <Link className="text-link min-h-11" to={{ pathname: '/trips', search }}>
            View trip sheets <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <DataTable columns={tripColumns} rows={period === demoPeriod ? demoTrips : []} label="Recent trip sheets"
          emptyTitle="No sample trip sheets for this period" />
      </section>
    </div>
  );
}
