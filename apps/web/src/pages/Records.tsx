import { useState } from 'react';
import { DataTable } from '../components/DataTable';
import type { TableColumn } from '../components/DataTable';
import { SearchField, StatusBadge } from '../components/ui';
import { demoEmployees, demoExpenses, demoPeriod, demoSalaries, demoSnapshots, demoTrips, demoVehicles } from '../demo/fixtures';
import { dateLabel, lkr } from '../lib/format';
import { periodLabel } from '../lib/period';

type Trip = typeof demoTrips[number];
type Vehicle = typeof demoVehicles[number];
type Employee = typeof demoEmployees[number];
type Salary = typeof demoSalaries[number];
type Expense = typeof demoExpenses[number];
type Snapshot = typeof demoSnapshots[number];

const statusTones = {
  Active: 'positive', Confirmed: 'positive', Settled: 'positive', Partial: 'warning', Draft: 'neutral',
} as const;

function recordStatus(value: keyof typeof statusTones) {
  return <StatusBadge tone={statusTones[value]}>{value}</StatusBadge>;
}

export const tripColumns: TableColumn<Trip>[] = [
  { key: 'id', label: 'Trip sheet', cell: (row) => row.id },
  { key: 'day', label: 'Date', cell: (row) => dateLabel(`${demoPeriod}-${row.day}`) },
  { key: 'vehicle', label: 'Vehicle', cell: (row) => row.vehicle },
  { key: 'route', label: 'Route', cell: (row) => row.route },
  { key: 'amount', label: 'Revenue', cell: (row) => lkr(row.amount), align: 'right' },
  { key: 'status', label: 'Status', cell: (row) => recordStatus(row.status) },
];

const vehicleColumns: TableColumn<Vehicle>[] = [
  { key: 'id', label: 'Registration', cell: (row) => row.id },
  { key: 'name', label: 'Vehicle name', cell: (row) => row.name },
  { key: 'model', label: 'Model', cell: (row) => row.model },
  { key: 'status', label: 'Status', cell: (row) => recordStatus(row.status) },
];

const employeeColumns: TableColumn<Employee>[] = [
  { key: 'name', label: 'Employee', cell: (row) => row.name },
  { key: 'id', label: 'Employee ID', cell: (row) => row.id },
  { key: 'role', label: 'Role', cell: (row) => row.role },
  { key: 'status', label: 'Status', cell: (row) => recordStatus(row.status) },
];

const salaryColumns: TableColumn<Salary>[] = [
  { key: 'name', label: 'Employee', cell: (row) => row.name },
  { key: 'earned', label: 'Earned', cell: (row) => lkr(row.earned), align: 'right' },
  { key: 'paid', label: 'Payments', cell: (row) => lkr(row.paid), align: 'right' },
  { key: 'balance', label: 'Balance', cell: (row) => lkr(row.balance), align: 'right' },
  { key: 'status', label: 'Status', cell: (row) => recordStatus(row.status) },
];

const expenseColumns: TableColumn<Expense>[] = [
  { key: 'id', label: 'Expense', cell: (row) => row.id },
  { key: 'day', label: 'Date', cell: (row) => dateLabel(`${demoPeriod}-${row.day}`) },
  { key: 'vehicle', label: 'Vehicle', cell: (row) => row.vehicle },
  { key: 'category', label: 'Category', cell: (row) => row.category },
  { key: 'description', label: 'Description', cell: (row) => row.description },
  { key: 'amount', label: 'Amount', cell: (row) => lkr(row.amount), align: 'right' },
];

const reportColumns: TableColumn<Snapshot>[] = [
  { key: 'period', label: 'Period', cell: (row) => periodLabel(row.period) },
  { key: 'revenue', label: 'Revenue', cell: (row) => lkr(row.revenue), align: 'right' },
  { key: 'earnings', label: 'Employee earnings', cell: (row) => lkr(row.earnings), align: 'right' },
  { key: 'expenses', label: 'Vehicle expenses', cell: (row) => lkr(row.expenses), align: 'right' },
  { key: 'profit', label: 'Operating profit', cell: (row) => lkr(row.profit), align: 'right' },
];

function RecordsTable<Row extends { id: string }>({ label, rows, columns, search }: {
  label: string;
  rows: Row[];
  columns: TableColumn<Row>[];
  search: (row: Row) => string;
}) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => search(row).toLowerCase().includes(term));
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{label}</h2>
        <SearchField label={`Search ${label.toLowerCase()}`} value={query} onChange={setQuery} />
      </div>
      <DataTable columns={columns} rows={visibleRows} label={label}
        emptyTitle={rows.length ? 'No records match your search' : 'No sample records for this period'} />
    </section>
  );
}

export type RecordPage = 'vehicles' | 'trips' | 'employees' | 'salaries' | 'expenses' | 'reports';

export function Records({ page, period }: { page: RecordPage; period: string }) {
  const hasRows = period === demoPeriod;
  switch (page) {
    case 'vehicles':
      return <RecordsTable label="Fleet vehicles" rows={demoVehicles} columns={vehicleColumns}
        search={(row) => `${row.id} ${row.name} ${row.model}`} />;
    case 'employees':
      return <RecordsTable label="Crew directory" rows={demoEmployees} columns={employeeColumns}
        search={(row) => `${row.id} ${row.name} ${row.role}`} />;
    case 'trips':
      return <RecordsTable label="Trip sheets" rows={hasRows ? demoTrips : []} columns={tripColumns}
        search={(row) => `${row.id} ${row.vehicle} ${row.route} ${row.status}`} />;
    case 'salaries':
      return <RecordsTable label="Employee balances" rows={hasRows ? demoSalaries : []} columns={salaryColumns}
        search={(row) => `${row.name} ${row.status}`} />;
    case 'expenses':
      return <RecordsTable label="Vehicle expenses" rows={hasRows ? demoExpenses : []} columns={expenseColumns}
        search={(row) => `${row.id} ${row.vehicle} ${row.category} ${row.description}`} />;
    case 'reports':
      return (
        <section className="panel">
          <div className="panel-header"><h2>Fleet operating statement</h2></div>
          <DataTable label="Fleet operating statement" columns={reportColumns}
            rows={demoSnapshots.filter((row) => row.period === period).map((row) => ({ ...row, id: row.period }))}
            emptyTitle="No sample report for this period" />
        </section>
      );
  }
}
