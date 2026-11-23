import { useContext, useState } from 'react';
import { useSearchParams } from 'react-router';
import { DataTable } from '../components/DataTable';
import type { TableColumn } from '../components/DataTable';
import { Button } from '../components/ui';
import { dateLabel, lkr } from '../lib/format';
import { FleetToken, fleetRequest, message, scope, useFleetQuery } from './client';
import { QueryResult } from './components';
import { categories } from './fields';
import type { Entity } from './fields';
import { Filter } from './LiveRecords';
import { download } from './Documents';

type Report = { title: string; company: string; range: { from: string; toExclusive: string }; generatedAt: string;
  columns: { label: string; kind?: 'money' | 'date' }[]; rows: (string | number)[][] };

const options = [
  { value: 'fleet-profit', label: 'Fleet operating statement' }, { value: 'vehicle-profit', label: 'Vehicle operating statement' },
  { value: 'employee-earnings', label: 'Employee earnings' }, { value: 'salary-payments', label: 'Salary payments' },
  { value: 'vehicle-trips', label: 'Trip history' }, { value: 'vehicle-expenses', label: 'Vehicle expenses' },
  { value: 'expense-breakdown', label: 'Expense breakdown' },
];

export function LiveReports({ period }: { period: string }) {
  const [params] = useSearchParams();
  const initial = params.get('report');
  const [kind, setKind] = useState(options.find((item) => item.value === initial)?.value ?? 'fleet-profit');
  const [vehicle, setVehicle] = useState(params.get('vehicleId') ?? '');
  const [employee, setEmployee] = useState(params.get('employeeId') ?? '');
  const [category, setCategory] = useState('');
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState('');
  const [through, setThrough] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const token = useContext(FleetToken);
  const vehicles = useFleetQuery<Entity[]>('/vehicles?limit=200', kind !== 'salary-payments');
  const people = useFleetQuery<Entity[]>('/employees?limit=200', kind === 'employee-earnings' || kind === 'salary-payments');
  const validDates = !custom || Boolean(from && through && from <= through);
  const end = custom && validDates ? new Date(Date.parse(through) + 86_400_000).toISOString().slice(0, 10) : undefined;
  const query = { month: custom ? undefined : period, from: custom ? from : undefined, toExclusive: end,
    vehicleId: kind !== 'salary-payments' ? vehicle : undefined,
    employeeId: kind === 'employee-earnings' || kind === 'salary-payments' ? employee : undefined,
    category: kind === 'vehicle-expenses' ? category : undefined };
  const ready = validDates && (kind !== 'vehicle-profit' || Boolean(vehicle));
  const report = useFleetQuery<Report>(scope(`/reports/${kind}`, query), ready);

  async function exportData(format: 'pdf' | 'xlsx') {
    setPending(true); setError('');
    try {
      const data = await fleetRequest(token, scope(`/reports/${kind}`, { ...query, format }));
      await download(data, `${kind}-${custom ? from : period}.${format}`);
    } catch (failure) { setError(message(failure)); } finally { setPending(false); }
  }

  return <section className="panel">
    <div className="panel-header">
      <div className="flex flex-wrap gap-2">
        <Filter label="Report" value={kind} options={options} onChange={setKind} allowEmpty={false} />
        {kind !== 'salary-payments' && <Filter label="Vehicle" value={vehicle} options={(vehicles.data ?? []).map((row) => ({ value: row.id, label: String(row.registration) }))} onChange={setVehicle} />}
        {(kind === 'employee-earnings' || kind === 'salary-payments') && <Filter label="Employee" value={employee}
          options={(people.data ?? []).map((row) => ({ value: row.id, label: String(row.fullName) }))} onChange={setEmployee} />}
        {kind === 'vehicle-expenses' && <Filter label="Category" value={category} options={categories} onChange={setCategory} />}
        <label className="field-label flex min-h-11 items-center gap-2"><input type="checkbox" checked={custom} onChange={(event) => setCustom(event.target.checked)} />Custom dates</label>
      </div>
      <div className="flex gap-2">
        <Button disabled={pending || !ready || !report.data} onClick={() => void exportData('pdf')}>PDF</Button>
        <Button disabled={pending || !ready || !report.data} onClick={() => void exportData('xlsx')}>Excel</Button>
      </div>
      {custom && <div className="flex flex-wrap gap-2">
        <label className="field-label">From <input className="select-field" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="field-label">Through <input className="select-field" type="date" value={through} min={from} onChange={(event) => setThrough(event.target.value)} /></label>
      </div>}
    </div>
    {error && <p role="alert" className="px-5 pb-3 text-sm text-danger">{error}</p>}
    {!ready ? <p className="px-5 pb-4 text-sm text-muted">{!validDates ? 'Choose a valid date range.' : 'Select a vehicle to load its operating statement.'}</p>
      : <QueryResult query={report}>{(data) => {
        const rows = data.rows.map((cells, index) => ({ id: String(index), cells }));
        const columns: TableColumn<typeof rows[number]>[] = data.columns.map((column, index) => ({
          key: `column-${index}`, label: column.label, align: column.kind === 'money' ? 'right' : undefined,
          cell: (row) => {
            const value = String(row.cells[index] ?? '—');
            if (column.kind === 'money' && /^-?\d+$/.test(value)) return lkr(value);
            return column.kind === 'date' ? dateLabel(value) : value;
          },
        }));
        return <DataTable rows={rows} columns={columns} label={data.title} />;
      }}</QueryResult>}
  </section>;
}
