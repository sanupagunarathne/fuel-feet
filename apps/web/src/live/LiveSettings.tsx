import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui';
import { EditDialog, EditorForm, QueryResult } from './components';
import { inputValues, recordPayload, settingsFields } from './fields';
import { useFleetMutation, useFleetQuery } from './client';
import { LiveRecords } from './LiveRecords';

type Settings = { businessName: string; contact: string | null; address: string | null; basis: string | null; policyApproved: boolean };
type Audit = { id: string; entityType: string; operation: string; createdAt: string; reason: string | null; before: unknown; after: unknown };

export function LiveSettings({ period }: { period: string }) {
  const [edit, setEdit] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState('');
  const settings = useFleetQuery<Settings | null>('/settings');
  const audit = useFleetQuery<Audit[]>(`/audit?limit=20&offset=${offset}`, auditOpen);
  const mutate = useFleetMutation();
  const queries = useQueryClient();

  return <>
    <section className="panel">
      <div className="panel-header"><h2>Business details</h2><Button onClick={() => setEdit(true)}>Edit business details</Button></div>
      <QueryResult query={settings}>{(data) => <ul className="space-y-2 px-5 pb-4 text-sm">
        <li><strong>{data?.businessName ?? 'Business name has not been set'}</strong></li>
        {data?.contact && <li className="whitespace-pre-wrap">{data.contact}</li>}
        {data?.address && <li className="whitespace-pre-wrap">{data.address}</li>}
        <li>Currency · LKR</li><li>Reporting time zone · Asia/Colombo</li>
        <li>Salary policy · {data?.policyApproved ? `${data.basis === 'GROSS' ? 'Gross' : 'Adjusted'} basis, half-up rounding` : 'Awaiting owner approval'}</li>
      </ul>}</QueryResult>
      {notice && <p role="status" className="px-5 pb-3 text-sm">{notice}</p>}
    </section>
    <section><h2 className="mb-2 font-semibold">Distributors</h2><LiveRecords page="distributors" period={period} /></section>
    <section className="panel">
      <div className="panel-header"><h2>Audit history</h2><Button onClick={() => setAuditOpen(!auditOpen)}>{auditOpen ? 'Hide audit history' : 'Show audit history'}</Button></div>
      {auditOpen && <QueryResult query={audit}>{(rows) => <>
        {rows.length === 0 && <p className="px-5 pb-4 text-sm text-muted">No audited changes yet.</p>}
        <div className="divide-y divide-[var(--border)] px-5 text-sm">{rows.map((row) => <details className="py-3" key={row.id}>
          <summary>{row.entityType} · {row.operation} · {new Intl.DateTimeFormat('en-LK', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.createdAt))}</summary>
          {row.reason && <p className="mt-2">{row.reason}</p>}
          <pre className="mt-2 max-h-52 overflow-auto text-xs">{JSON.stringify({ before: row.before, after: row.after }, null, 2)}</pre>
        </details>)}</div>
        {(offset > 0 || rows.length === 20) && <div className="panel-header justify-end">
          {offset > 0 && <Button onClick={() => setOffset(offset - 20)}>Previous</Button>}
          {rows.length === 20 && <Button onClick={() => setOffset(offset + 20)}>Next</Button>}
        </div>}
      </>}</QueryResult>}
    </section>
    {edit && <EditDialog title="Edit business details" onClose={() => setEdit(false)}>
      <QueryResult query={settings}>{(data) => <EditorForm fields={settingsFields}
        initial={inputValues(settingsFields, data ?? {})} onClose={() => setEdit(false)} onSubmit={async (values) => {
          await mutate('/settings', 'PATCH', recordPayload(settingsFields, values));
          await queries.invalidateQueries({ queryKey: ['fleet'] });
          setEdit(false); setNotice('Business details saved.');
        }} />}</QueryResult>
    </EditDialog>}
  </>;
}
