import { useContext, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../components/DataTable';
import type { TableColumn } from '../components/DataTable';
import { Button, StatusBadge } from '../components/ui';
import { currentPeriod, periodLabel } from '../lib/period';
import { dateLabel, lkr } from '../lib/format';
import { FleetToken, fleetRequest, message, scope, useFleetMutation, useFleetQuery } from './client';
import { EditDialog, EditorForm, QueryResult } from './components';
import { asDecimal, employeeLabel, inputValues, label, reasonField, recordPayload, roles, today } from './fields';
import type { Entity, Field } from './fields';
import { download } from './Documents';
import { Filter } from './LiveRecords';

type Balance = { id: string; name: string; role: string; earned: string; applied: string | null; advance: string | null; carriedIn: string | null; carriedOut: string | null; balance: string | null; status: string; trips: number };
type Detail = { summary: Balance | null; trips: { id: string; reference: string; date: string; basisCents: string | null; rateBps: number | null; loadedDistanceKm: string | null; ratePerKmCents: string | null; amountCents: string }[]; payments: Entity[] };
const currency = (value: string | null) => value === null ? '—' : lkr(value);
const statuses = ['Unpaid', 'Partial', 'Settled', 'Credit', 'Advance carried'].map((value) => ({ value, label: value }));

export function LiveSalaries({ period }: { period: string }) {
  const [params] = useSearchParams();
  const [employeeId, setEmployeeId] = useState(params.get('employeeId') ?? '');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [view, setView] = useState<{ kind: 'payment' | 'advance' | 'details' | 'reverse'; row?: Entity; balance?: Balance }>();
  const [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState('');
  const queries = useQueryClient();
  const mutate = useFleetMutation();
  const people = useFleetQuery<Entity[]>('/employees?limit=200');
  const vehicles = useFleetQuery<Entity[]>('/vehicles?limit=200');
  const summary = useFleetQuery<Balance[]>(scope('/salaries', { month: period, employeeId, role, status: vehicleId ? undefined : status, vehicleId }));
  const paymentQuery = useFleetQuery<Entity[]>(scope('/salary-payments', { month: period, employeeId, offset, limit: 25 }), !vehicleId);
  const options = (people.data ?? []).map((person) => ({ value: person.id, label: employeeLabel(person) }));
  const close = () => setView(undefined);

  const columns: TableColumn<Balance>[] = [
    { key: 'name', label: 'Employee', cell: (row) => row.name },
    { key: 'role', label: 'Role', cell: (row) => label(row.role) },
    { key: 'trips', label: 'Trips', cell: (row) => row.trips },
    { key: 'earned', label: 'Earned', cell: (row) => currency(row.earned), align: 'right' },
    { key: 'carriedIn', label: 'Advance brought forward', cell: (row) => currency(row.carriedIn), align: 'right' },
    { key: 'advance', label: 'New advances', cell: (row) => currency(row.advance), align: 'right' },
    { key: 'carriedOut', label: 'Advance carried forward', cell: (row) => currency(row.carriedOut), align: 'right' },
    { key: 'applied', label: 'Salary paid', cell: (row) => currency(row.applied), align: 'right' },
    { key: 'balance', label: 'Balance', cell: (row) => currency(row.balance), align: 'right' },
    { key: 'status', label: 'Status', cell: (row) => <StatusBadge tone={row.status === 'Unpaid' || row.status === 'Partial' || row.status === 'Advance carried' ? 'warning' : 'neutral'}>{row.status}</StatusBadge> },
    { key: 'actions', label: 'Actions', cell: (row) => <Button onClick={() => setView({ kind: 'details', balance: row })}>View earnings</Button> },
  ];
  const paymentColumns: TableColumn<Entity>[] = [
    { key: 'employee', label: 'Employee', cell: (row) => options.find((option) => option.value === row.employeeId)?.label ?? '—' },
    { key: 'paidOn', label: 'Paid on', cell: (row) => dateLabel(String(row.paidOn)) },
    { key: 'reference', label: 'Reference', cell: (row) => String(row.reference ?? '—') },
    { key: 'amount', label: 'Amount', cell: (row) => lkr(String(row.amountCents)), align: 'right' },
    { key: 'type', label: 'Type', cell: (row) => row.advance ? 'Advance' : 'Salary payment' },
    { key: 'status', label: 'Status', cell: (row) => label(String(row.status)) },
    { key: 'reverse', label: 'Action', cell: (row) => row.status === 'RECORDED'
      ? <Button onClick={() => setView({ kind: 'reverse', row })}>Reverse</Button>
      : <Button onClick={() => setView({ kind: row.advance ? 'advance' : 'payment', row })}>Record replacement</Button> },
  ];
  const isAdvance = view?.kind === 'advance';
  const fields: Field[] = [
    { name: 'employeeId', label: 'Employee', kind: 'select', options },
    ...(isAdvance ? [] : [{ name: 'earningsMonth', label: 'Earnings month', kind: 'month', initial: period }] as Field[]),
    { name: 'paidOn', label: isAdvance ? 'Advance date' : 'Payment date', kind: 'date', initial: isAdvance && period !== currentPeriod() ? '' : today() },
    { name: 'amount', label: isAdvance ? 'Advance amount (LKR)' : 'Payment amount (LKR)', kind: 'money' },
    { name: 'reference', label: 'Payment reference', optional: true },
    { name: 'notes', label: 'Notes', kind: 'textarea', optional: true },
  ];
  async function saved(notice: string) {
    await queries.invalidateQueries({ queryKey: ['fleet'] });
    setNotice(notice); close();
  }

  return <div className="grid gap-4">
    <section className="panel">
      <div className="panel-header">
        <div className="flex min-w-0 max-w-full flex-wrap gap-2">
          <Filter label="Employee" value={employeeId} options={options} onChange={(value) => { setEmployeeId(value); setOffset(0); }} />
          <Filter label="Role" value={role} options={roles} onChange={setRole} />
          <Filter label="Vehicle" value={vehicleId} options={(vehicles.data ?? []).map((row) => ({ value: row.id, label: String(row.registration) }))} onChange={setVehicleId} />
          {!vehicleId && <Filter label="Payment status" value={status} options={statuses} onChange={setStatus} />}
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap gap-2">
          <Button variant="primary" onClick={() => setView({ kind: 'advance' })}>Record advance</Button>
          <Button onClick={() => setView({ kind: 'payment' })}>Record payment</Button>
        </div>
      </div>
      {notice && <p role="status" className="px-5 pb-3 text-sm">{notice}</p>}
      {vehicleId && <p className="px-5 pb-3 text-sm text-muted">Vehicle earnings only. Clear the vehicle filter to show employee payments and balances.</p>}
      <QueryResult query={summary}>{(rows) => <DataTable rows={rows} columns={columns} label="Employee balances" />}</QueryResult>
    </section>
    {!vehicleId && <section className="panel">
      <div className="panel-header"><h2>Advances and payments for this month</h2>
        <Link className="text-link min-h-11" to={scope('/reports', { period, report: 'salary-payments', employeeId })}>Payment report</Link>
      </div>
      <QueryResult query={paymentQuery}>{(rows) => <>
        <DataTable rows={rows} columns={paymentColumns} label="Recorded payments" />
        {(offset > 0 || rows.length === 25) && <div className="panel-header justify-end">
          {offset > 0 && <Button onClick={() => setOffset(offset - 25)}>Previous</Button>}
          {rows.length === 25 && <Button onClick={() => setOffset(offset + 25)}>Next</Button>}
        </div>}
      </>}</QueryResult>
    </section>}
    {view?.kind === 'details' && view.balance && <SalaryDetail balance={view.balance} period={period} vehicle={vehicleId} onClose={close} />}
    {(view?.kind === 'payment' || view?.kind === 'advance') && <EditDialog
      title={isAdvance ? (view.row ? 'Record replacement advance' : 'Record advance') : view.row ? 'Record replacement payment' : 'Record salary payment'} onClose={close}>
      <QueryResult query={people}>{() => <EditorForm fields={fields} initial={inputValues(fields, {
        employeeId: view.row?.employeeId ?? employeeId,
        earningsMonth: String(view.row?.earningsMonth ?? period).slice(0, 7),
      })} onClose={close} onSubmit={async (values) => {
        const month = isAdvance ? values.paidOn!.slice(0, 7) : values.earningsMonth!;
        await mutate('/salary-payments', 'POST', { ...recordPayload(fields, values), earningsMonth: month,
          advance: isAdvance, replacesId: view.row?.id ?? null });
        await saved(isAdvance ? `Advance recorded for ${periodLabel(month)}.` : 'Payment recorded.');
      }} />}</QueryResult>
    </EditDialog>}
    {view?.kind === 'reverse' && <EditDialog title="Reverse payment" onClose={close}>
      <EditorForm fields={[reasonField]} initial={{ reason: '' }} onClose={close} submitLabel="Reverse payment" onSubmit={async (values) => {
        await mutate(`/salary-payments/${view.row?.id}/reverse`, 'POST', { reason: values.reason });
        await saved('Payment reversed.');
      }} />
    </EditDialog>}
  </div>;
}

function SalaryDetail({ balance, period, vehicle, onClose }: { balance: Balance; period: string; vehicle: string; onClose: () => void }) {
  const query = useFleetQuery<Detail>(scope(`/salaries/employees/${balance.id}`, { month: period, vehicleId: vehicle }));
  const token = useContext(FleetToken);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return <EditDialog title={`Earnings for ${balance.name}`} onClose={onClose}>
    <QueryResult query={query}>{({ trips, summary, payments }) => <>
      <p>Earned <strong>{currency(summary?.earned ?? null)}</strong> · Balance <strong>{currency(summary?.balance ?? null)}</strong></p>
      {summary?.advance !== null && summary?.advance !== undefined && <ul className="mt-2 text-sm">
        <li>Advance brought forward · {currency(summary.carriedIn)}</li>
        <li>New advances · {currency(summary.advance)}</li>
        <li>Advance carried forward · {currency(summary.carriedOut)}</li>
      </ul>}
      <ul className="mt-3 divide-y divide-[var(--border)] text-sm">{trips.map((trip) => <li className="py-2" key={trip.id}>
        <strong>{trip.reference}</strong> · {dateLabel(trip.date)}<br />
        {trip.loadedDistanceKm !== null && trip.ratePerKmCents !== null
          ? `${Number(trip.loadedDistanceKm)} km × ${lkr(trip.ratePerKmCents)}/km`
          : `${currency(trip.basisCents)} × ${asDecimal(String(trip.rateBps))}%`} · {lkr(trip.amountCents)}
      </li>)}</ul>
      {payments.length > 0 && <><h3 className="mt-4 font-semibold">Payment history</h3><ul className="mt-2 text-sm">
        {payments.map((payment) => <li className="py-1" key={payment.id}>{dateLabel(String(payment.paidOn))} · {lkr(String(payment.amountCents))} · {payment.advance ? 'Advance' : 'Salary payment'} · {label(String(payment.status))}</li>)}
      </ul></>}
      <Button className="mt-4" disabled={pending} onClick={() => {
        setPending(true); setError('');
        void fleetRequest(token, scope('/reports/employee-statement', { month: period, employeeId: balance.id, vehicleId: vehicle, format: 'pdf' }))
          .then((res) => download(res, `employee-earnings-${period}.pdf`)).catch((failure) => setError(message(failure))).finally(() => setPending(false));
      }}>Download statement PDF</Button>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </>}</QueryResult>
  </EditDialog>;
}
