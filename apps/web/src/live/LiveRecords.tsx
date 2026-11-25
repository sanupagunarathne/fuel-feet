import { useContext, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../components/DataTable';
import type { TableColumn } from '../components/DataTable';
import { Button, SearchField, StatusBadge } from '../components/ui';
import { dateLabel, lkr } from '../lib/format';
import { FleetToken, fleetRequest, scope, useFleetMutation, useFleetQuery } from './client';
import { EditDialog, EditorForm, QueryResult } from './components';
import { asDecimal, categories, distributorFields, employeeFields, employeeLabel, inputValues, label, reasonField,
  recordPayload, roles, today, tripStates, vehicleFields } from './fields';
import type { Entity, Field, Option } from './fields';
import { Documents } from './Documents';

export type EntityPage = 'vehicles' | 'employees' | 'trips' | 'expenses' | 'distributors';
type Editor = { action: 'new' | 'edit' | 'crew' | 'confirm' | 'void' | 'files' | 'discard'; row?: Entity };
type Crew = { id: string; employeeId: string; role: string; startsOn: string; endsBefore: string | null };

const pageTitles: Record<EntityPage, string> = { vehicles: 'Vehicle', employees: 'Employee', trips: 'Trip', expenses: 'Expense', distributors: 'Distributor' };
const pageSize = 25;

function entityOptions(rows: Entity[], name: string, role?: string) {
  return rows.filter((row) => !role || row.role === role).map((row) => ({
    value: row.id, label: `${name === 'fullName' ? employeeLabel(row) : String(row[name])}${row.active === false ? ' (inactive)' : ''}`,
  }));
}

function listColumn(key: string, title: string): TableColumn<Entity> {
  return { key, label: title, cell: (row) => String(row[key] ?? '—') };
}
const statusColumn: TableColumn<Entity> = {
  key: 'status', label: 'Status',
  cell: (row) => {
    const status = row.voided ? 'Voided' : row.status ? label(String(row.status)) : row.active === false ? 'Inactive' : 'Active';
    return <StatusBadge tone={status === 'Confirmed' || status === 'Active' ? 'positive' : status === 'Voided' ? 'negative' : 'neutral'}>{status}</StatusBadge>;
  },
};

export function LiveRecords({ page, period }: { page: EntityPage; period: string }) {
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<Editor>();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');
  const [vehicle, setVehicle] = useState(params.get('vehicleId') ?? '');
  const [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState('');
  const quickAdd = (page === 'trips' || page === 'expenses') && params.get('entry') === 'new';
  const editor = dialog ?? (quickAdd ? { action: 'new' } as const : undefined);
  const queries = useQueryClient();
  const dateScoped = page === 'trips' || page === 'expenses';
  const directory = page === 'vehicles' || page === 'employees';
  const data = useFleetQuery<Entity[]>(scope(`/${page}`, {
    month: dateScoped ? period : undefined, vehicleId: dateScoped ? vehicle : undefined,
    limit: pageSize, offset, search: directory || page === 'expenses' ? text : undefined,
    category: page === 'expenses' ? filter : undefined, status: page === 'trips' ? filter : undefined,
    role: page === 'employees' ? filter : undefined, active: page === 'vehicles' ? filter : undefined,
  }));
  const allVehicles = useFleetQuery<Entity[]>('/vehicles?limit=200', dateScoped);
  const vehicleChoices = entityOptions(allVehicles.data ?? [], 'registration');
  const close = () => {
    setDialog(undefined);
    if (quickAdd) {
      const next = new URLSearchParams(params);
      next.delete('entry');
      setParams(next, { replace: true });
    }
  };
  const actions: TableColumn<Entity> = { key: 'actions', label: 'Actions', cell: (row) => (
    <div className="flex flex-wrap gap-2">
      {row.status !== 'VOIDED' && !row.voided && <Button onClick={() => setDialog({ action: 'edit', row })}>
        {row.status === 'CONFIRMED' ? 'Correct' : 'Edit'}
      </Button>}
      {row.status === 'DRAFT' && <>
        <Button onClick={() => setDialog({ action: 'confirm', row })}>Confirm</Button>
        <Button onClick={() => setDialog({ action: 'discard', row })}>Discard draft</Button>
      </>}
      {(row.status === 'CONFIRMED' || page === 'expenses' && !row.voided) && <Button onClick={() => setDialog({ action: 'void', row })}>Void</Button>}
      {page === 'vehicles' && <>
        <Button onClick={() => setDialog({ action: 'crew', row })}>Crew</Button>
        <Link className="text-link" to={scope('/trips', { period, vehicleId: row.id })}>Trip history</Link>
        <Link className="text-link" to={scope('/expenses', { period, vehicleId: row.id })}>Expenses</Link>
        <Link className="text-link" to={scope('/reports', { period, vehicleId: row.id, report: 'vehicle-profit' })}>Profit</Link>
      </>}
      {page === 'employees' && <Link className="text-link" to={scope('/salaries', { period, employeeId: row.id })}>Earnings</Link>}
      {dateScoped && <Button onClick={() => setDialog({ action: 'files', row })}>Documents</Button>}
    </div>
  ) };
  const vehicleName: TableColumn<Entity> = { key: 'vehicleId', label: 'Vehicle',
    cell: (row) => vehicleChoices.find((option) => option.value === row.vehicleId)?.label ?? '—' };
  const moneyColumn = (key: string, title: string): TableColumn<Entity> => ({ key, label: title,
    cell: (row) => key === 'revenueCents' && row.status === 'DRAFT' ? '—' : lkr(String(row[key])), align: 'right' });
  const dateColumn = (key: string): TableColumn<Entity> => ({ key, label: 'Date', cell: (row) => dateLabel(String(row[key])) });
  const columns: Record<EntityPage, TableColumn<Entity>[]> = {
    vehicles: [listColumn('registration', 'Registration'), listColumn('nickname', 'Vehicle name'), listColumn('model', 'Model'), statusColumn],
    employees: [{ key: 'fullName', label: 'Employee', cell: employeeLabel },
      { key: 'role', label: 'Role', cell: (r) => label(String(r.role)) }, statusColumn],
    trips: [listColumn('reference', 'Trip sheet'), dateColumn('tripDate'), vehicleName,
      { key: 'distance', label: 'Loaded distance', cell: (row) => row.loadedDistanceKm ? `${Number(row.loadedDistanceKm)} km` : '—' }, moneyColumn('revenueCents', 'Revenue'), statusColumn],
    expenses: [{ key: 'category', label: 'Category', cell: (r) => label(String(r.category)) }, dateColumn('expenseDate'), vehicleName,
      listColumn('description', 'Description'), moneyColumn('amountCents', 'Amount'), statusColumn],
    distributors: [listColumn('name', 'Distributor'), statusColumn],
  };
  const filters = page === 'trips' ? tripStates : page === 'expenses' ? categories : page === 'employees' ? roles
    : [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }];

  async function saved() {
    await queries.invalidateQueries({ queryKey: ['fleet'] });
    close();
    setNotice(editor?.action === 'discard' ? 'Trip draft discarded.' : 'Record saved.');
  }
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="flex flex-wrap items-center gap-2">
          {(directory || page === 'expenses') && <SearchField label={`Search ${page}`} value={text} onChange={(value) => { setText(value); setOffset(0); }} />}
          {dateScoped && <Filter label="Vehicle" value={vehicle} options={vehicleChoices} onChange={(value) => { setVehicle(value); setOffset(0); }} />}
          {page !== 'distributors' && <Filter label={page === 'expenses' ? 'Category' : page === 'employees' ? 'Role' : 'Status'}
            value={filter} options={filters} onChange={(value) => { setFilter(value); setOffset(0); }} />}
        </div>
        <Button variant="primary" onClick={() => { setNotice(''); setDialog({ action: 'new' }); }}>Add {pageTitles[page].toLowerCase()}</Button>
      </div>
      {notice && <p role="status" className="px-5 pb-3 text-sm">{notice}</p>}
      <QueryResult query={data}>{(rows) => <>
        <DataTable rows={rows} columns={[...columns[page], actions]} label={page === 'trips' ? 'Trip sheets' : page} />
        {(offset > 0 || rows.length === pageSize) && <div className="panel-header justify-end">
          {offset > 0 && <Button onClick={() => setOffset(offset - pageSize)}>Previous</Button>}
          {rows.length === pageSize && <Button onClick={() => setOffset(offset + pageSize)}>Next</Button>}
        </div>}
      </>}</QueryResult>
      {editor && (
        <RecordDialog editor={editor} page={page} period={period} onClose={close} onSaved={saved} />
      )}
    </section>
  );
}

export function Filter({ label, value, options, onChange, allowEmpty = true }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void; allowEmpty?: boolean;
}) {
  return <label className="field-label min-w-0 max-w-full">
    <span className="sr-only">{label}</span>
    <select className="select-field max-w-full" value={value} onChange={(event) => onChange(event.target.value)}>
      {allowEmpty && <option value="">{label === 'Category' ? 'All categories' : label.endsWith('status') || label === 'Status' ? 'All statuses' : `All ${label.toLowerCase()}s`}</option>}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

function RecordDialog({ editor, page, period, onClose, onSaved }: {
  editor: Editor; page: EntityPage; period: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { action, row } = editor;
  const mutate = useFleetMutation();
  if (action === 'discard' && row) {
    return <EditDialog title="Discard trip draft" onClose={onClose}>
      <EditorForm fields={[]} initial={{}} onClose={onClose} submitLabel="Discard draft" onSubmit={async () => {
        await mutate(`/trips/${row.id}/discard`, 'POST', { version: row.version });
        await onSaved();
      }}>
        <p className="text-sm">Discard trip draft {row.reference}? This removes the draft and its documents from the trip list.</p>
      </EditorForm>
    </EditDialog>;
  }
  const title = `${{ new: 'Add', edit: row?.status === 'CONFIRMED' ? 'Correct' : 'Edit', crew: 'Manage', confirm: 'Confirm', void: 'Void', files: 'Documents for', discard: 'Discard' }[action]} ${action === 'crew' ? 'crew' : pageTitles[page].toLowerCase()}`;
  if (action === 'files' && row && (page === 'trips' || page === 'expenses')) {
    return <EditDialog title={title} onClose={onClose}><Documents page={page} id={row.id} /></EditDialog>;
  }
  return <EditDialog title={title} onClose={onClose}>
    {action === 'crew' && row
      ? <CrewEditor vehicle={row} onClose={onClose} onSaved={onSaved} />
      : <RecordEditor editor={editor} page={page} period={period} onClose={onClose} onSaved={onSaved} />}
  </EditDialog>;
}

function CrewEditor({ vehicle, onClose, onSaved }: { vehicle: Entity; onClose: () => void; onSaved: () => Promise<void> }) {
  const history = useFleetQuery<Crew[]>(`/vehicles/${vehicle.id}/crew`);
  const roster = useFleetQuery<Entity[]>('/employees?limit=200');
  const mutate = useFleetMutation();
  return <QueryResult query={history}>{(rows) => <QueryResult query={roster}>{(people) => {
    const fields: Field[] = [
      { name: 'startsOn', label: 'Effective date', kind: 'date', initial: today() },
      { name: 'driverId', label: 'Regular driver', kind: 'select', optional: true, options: entityOptions(people, 'fullName', 'DRIVER') },
      { name: 'conductorId', label: 'Regular conductor', kind: 'select', optional: true, options: entityOptions(people, 'fullName', 'CONDUCTOR') },
    ];
    const employee = (id: string) => people.find((person) => person.id === id)?.fullName ?? 'Employee';
    return <>
      {rows.length > 0 && <details className="mb-4"><summary className="font-semibold">Crew assignment history</summary>
        <ul className="mt-2 space-y-1 text-sm">{rows.map((item) => <li key={item.id}>
          {String(employee(item.employeeId))} · {dateLabel(item.startsOn)}{item.endsBefore ? ` to before ${dateLabel(item.endsBefore)}` : ' onward'}
        </li>)}</ul></details>}
      <EditorForm initial={inputValues(fields, {
        driverId: rows.find((entry) => entry.role === 'DRIVER' && !entry.endsBefore)?.employeeId,
        conductorId: rows.find((entry) => entry.role === 'CONDUCTOR' && !entry.endsBefore)?.employeeId,
      })} fields={fields} onClose={onClose} onSubmit={async (values) => {
        await mutate(`/vehicles/${vehicle.id}/crew`, 'PUT', recordPayload(fields, values)); await onSaved();
      }} />
    </>;
  }}</QueryResult>}</QueryResult>;
}

type Preview = { preview: string; basis?: string; revenueCents: string; loadedDistanceKm?: string; litres?: number;
  entitlements: { role: string; rateBps: number | null; ratePerKmCents: string | null; amountCents: string }[] };
function RecordEditor({ editor, page, period, onClose, onSaved }: {
  editor: Editor; page: EntityPage; period: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { action, row } = editor;
  const [approvedPreview, setApprovedPreview] = useState('');
  const token = useContext(FleetToken);
  const mutate = useFleetMutation();
  const needsEntries = (action === 'new' || action === 'edit') && (page === 'trips' || page === 'expenses');
  const vehicles = useFleetQuery<Entity[]>('/vehicles?limit=200', needsEntries);
  const employees = useFleetQuery<Entity[]>('/employees?limit=200', needsEntries && page === 'trips');
  const distributors = useFleetQuery<Entity[]>('/distributors?limit=200', needsEntries && page === 'trips');
  const trips = useFleetQuery<Entity[]>(scope('/trips', { month: period, limit: 200 }), needsEntries && page === 'expenses');
  const prerequisites = needsEntries ? (page === 'trips' ? [vehicles, employees, distributors] : [vehicles, trips]) : [];
  for (const result of prerequisites) {
    if (result.isPending || result.isError) return <QueryResult query={result as typeof vehicles}>{() => null}</QueryResult>;
  }

  const vehicleField: Field = { name: 'vehicleId', label: 'Vehicle', kind: 'select', options: entityOptions(vehicles.data ?? [], 'registration') };
  const legacy = row?.status === 'CONFIRMED' && row.loadedDistanceKm === null;
  const adjusted = legacy && row.basis === 'ADJUSTED';
  const tripFields: Field[] = [
    { name: 'reference', label: 'Trip-sheet reference' }, vehicleField,
    { name: 'tripDate', label: 'Trip date', kind: 'date', initial: today() },
    { name: 'distributorId', label: 'Distributor', kind: 'select', optional: true, options: entityOptions(distributors.data ?? [], 'name') },
    { name: 'driverId', label: 'Actual driver', kind: 'select', optional: true, options: entityOptions(employees.data ?? [], 'fullName', 'DRIVER') },
    { name: 'conductorId', label: 'Actual conductor', kind: 'select', optional: true, options: entityOptions(employees.data ?? [], 'fullName', 'CONDUCTOR') },
    { name: 'origin', label: 'Origin', optional: true }, { name: 'destination', label: 'Destination', optional: true },
    ...(legacy ? [{ name: 'revenue', label: 'Revenue (LKR)', kind: 'money' }] as Field[]
      : [{ name: 'loadedDistanceKm', label: 'Loaded one-way distance (km)', kind: 'decimal' }] as Field[]),
    ...(adjusted ? [{ name: 'adjustedBasis', label: 'Adjusted salary basis (LKR)', kind: 'money', optional: true },
      { name: 'adjustmentReason', label: 'Basis adjustment reason', optional: true }] as Field[] : []),
    { name: 'notes', label: 'Notes', kind: 'textarea', optional: true },
  ];
  const expenseFields: Field[] = [
    vehicleField, { name: 'expenseDate', label: 'Expense date', kind: 'date', initial: today() },
    { name: 'category', label: 'Category', kind: 'select', options: categories },
    { name: 'amount', label: 'Amount (LKR)', kind: 'money' },
    { name: 'tripId', label: 'Related trip', kind: 'select', optional: true, options: entityOptions(trips.data ?? [], 'reference') },
    { name: 'description', label: 'Description', kind: 'textarea', optional: true },
  ];
  const base = { vehicles: vehicleFields, employees: employeeFields, distributors: distributorFields, trips: tripFields, expenses: expenseFields }[page];
  const correcting = page === 'trips' && action === 'edit' && row?.status === 'CONFIRMED';
  const review = action === 'confirm' || correcting;
  const fields = action === 'void' ? [reasonField] : action === 'confirm' ? []
    : correcting || page === 'expenses' && action === 'edit' ? [...base, reasonField] : base;
  const initial = inputValues(fields, {
    ...row,
    ...(row?.revenueCents === undefined ? {} : { revenue: asDecimal(String(row.revenueCents)) }),
    ...(row?.amountCents === undefined ? {} : { amount: asDecimal(String(row.amountCents)) }),
    ...(adjusted && row?.basisCents ? { adjustedBasis: asDecimal(String(row.basisCents)) } : {}),
  });
  const path = `/${page}${row ? `/${row.id}` : ''}`;
  return <EditorForm fields={fields} initial={initial} onClose={onClose}
    submitLabel={action === 'confirm' ? 'Confirm trip' : action === 'void' ? 'Void record' : page === 'trips' && !correcting ? 'Save draft' : 'Save'}
    autoDefaults={page === 'trips' && action === 'new'}
    loadDefaults={page === 'trips' && (action === 'new' || action === 'edit') ? async (values) => {
      if (!values.vehicleId || !values.tripDate) throw new Error('Choose a vehicle and a trip date.');
      const data = await (await fleetRequest(token, scope('/trips/default-crew', { vehicleId: values.vehicleId, date: values.tripDate }))).json();
      return { driverId: data.driverId ?? '', conductorId: data.conductorId ?? '' };
    } : undefined}
    onPreview={review ? async (values) => {
      const proposed = correcting ? { trip: recordPayload(base, values) } : {};
      const preview = await mutate(`${path}/preview`, 'POST', proposed, false) as Preview;
      setApprovedPreview(preview.preview);
      return <>
        <p className="font-semibold">Trip revenue · {lkr(preview.revenueCents)}</p>
        {preview.loadedDistanceKm && <p className="mt-1 text-sm">{Number(preview.loadedDistanceKm)} km loaded · {preview.litres?.toLocaleString('en-LK')} L</p>}
        <ul className="mt-1 text-sm">{preview.entitlements.map((entry) => <li key={entry.role}>
          {label(entry.role)} · {entry.ratePerKmCents === null ? `${asDecimal(String(entry.rateBps))}%` : `${lkr(entry.ratePerKmCents)}/km`} · {lkr(entry.amountCents)}
        </li>)}</ul>
      </>;
    } : undefined}
    onSubmit={async (values) => {
      if (action === 'void') await mutate(`${path}/void`, 'POST', { version: row?.version, reason: values.reason });
      else if (action === 'confirm') await mutate(`${path}/confirm`, 'POST', { version: row?.version, preview: approvedPreview });
      else {
        const record = recordPayload(base, values);
        if (!row) await mutate(path, 'POST', record);
        else if (correcting) await mutate(`${path}/correct`, 'POST', {
          version: row.version, reason: values.reason, trip: record, preview: approvedPreview,
        });
        else if (page === 'trips') await mutate(path, 'PATCH', { version: row.version, trip: record });
        else if (page === 'expenses') await mutate(path, 'PATCH', { version: row.version, expense: record, reason: values.reason });
        else await mutate(path, 'PATCH', { updatedAt: row.updatedAt, record });
      }
      await onSaved();
    }} />;
}
