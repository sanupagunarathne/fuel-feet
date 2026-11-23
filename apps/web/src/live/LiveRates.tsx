import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui';
import { lkr } from '../lib/format';
import { currentPeriod, periodLabel, shiftPeriod } from '../lib/period';
import { useFleetMutation, useFleetQuery } from './client';
import { EditDialog, EditorForm, QueryResult } from './components';
import { asDecimal, inputValues, recordPayload } from './fields';
import type { Field } from './fields';

type Rate = { effectiveMonth: string; iocTariff: string; driverCentsPerKm: string; conductorCentsPerKm: string };
const fields: Field[] = [
  { name: 'effectiveMonth', label: 'Effective month', kind: 'month' },
  { name: 'iocTariff', label: 'IOC tariff (LKR per litre per km)', kind: 'decimal' },
  { name: 'driverPerKm', label: 'Driver pay (LKR per km)', kind: 'money' },
  { name: 'conductorPerKm', label: 'Conductor pay (LKR per km)', kind: 'money' },
];

export function LiveRates() {
  const rates = useFleetQuery<Rate[]>('/rates');
  const queryClient = useQueryClient();
  const mutate = useFleetMutation();
  const [initial, setInitial] = useState<Record<string, string>>();
  const [notice, setNotice] = useState('');
  const month = currentPeriod();

  function edit(rate: Rate | undefined, effectiveMonth: string) {
    setNotice('');
    setInitial(inputValues(fields, {
      effectiveMonth,
      iocTariff: rate?.iocTariff ?? '',
      driverPerKm: asDecimal(rate?.driverCentsPerKm ?? '4500'),
      conductorPerKm: asDecimal(rate?.conductorCentsPerKm ?? '4000'),
    }));
  }

  return <section className="panel">
    <QueryResult query={rates}>{(history) => {
      const current = history.find((rate) => rate.effectiveMonth <= month + '-01');
      const nextMonth = current ? shiftPeriod(month, 1) : month;
      return <>
        <div className="panel-header">
          <h2>Rates</h2>
          <Button onClick={() => edit(history.find((rate) => rate.effectiveMonth === nextMonth + '-01') ?? current, nextMonth)}>
            {history.length ? 'Schedule rates' : 'Set rates'}
          </Button>
        </div>
        <div className="px-5 pb-4 text-sm">
          <p className="text-muted">Rates apply from the first day of their effective month.</p>
          {!current && <p className="mt-2 font-semibold">No rates in effect this month.</p>}
          {history.length > 0 && <ul className="mt-2 divide-y divide-[var(--border)]">
            {history.map((rate) => {
              const effective = rate.effectiveMonth.slice(0, 7);
              return <li key={effective} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-semibold">{periodLabel(effective)}{rate === current ? ' · Current' : effective > month ? ' · Scheduled' : ''}</p>
                  <p className="mt-1 text-muted">IOC {asTariff(rate.iocTariff)} · Driver {lkr(rate.driverCentsPerKm)}/km · Conductor {lkr(rate.conductorCentsPerKm)}/km</p>
                </div>
                {effective > month && <Button onClick={() => edit(rate, effective)}>Edit scheduled rates</Button>}
              </li>;
            })}
          </ul>}
          {notice && <p role="status" className="mt-2">{notice}</p>}
        </div>
      </>;
    }}</QueryResult>
    {initial && <EditDialog title="Set trip rates" onClose={() => setInitial(undefined)}>
      <EditorForm fields={fields} initial={initial} onClose={() => setInitial(undefined)} onSubmit={async (values) => {
        await mutate('/rates', 'PUT', recordPayload(fields, values));
        await queryClient.invalidateQueries({ queryKey: ['fleet'] });
        setInitial(undefined);
        setNotice('Rates saved.');
      }} />
    </EditDialog>}
  </section>;
}

function asTariff(rate: string) {
  return `Rs. ${rate.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}/litre/km`;
}
