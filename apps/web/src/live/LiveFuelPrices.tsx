import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui';
import { dateLabel, lkr } from '../lib/format';
import { useFleetMutation, useFleetQuery } from './client';
import { EditDialog, EditorForm, QueryResult } from './components';
import { asDecimal, today } from './fields';
import type { Field } from './fields';

type FuelPrice = { effectiveDate: string; centsPerLitre: string };
const fields: Field[] = [
  { name: 'effectiveDate', label: 'Effective date', kind: 'date' },
  { name: 'pricePerLitre', label: 'Fuel price (LKR per litre)', kind: 'money' },
];

export function LiveFuelPrices() {
  const prices = useFleetQuery<FuelPrice[]>('/fuel-prices');
  const queries = useQueryClient();
  const mutate = useFleetMutation();
  const [initial, setInitial] = useState<Record<string, string>>();
  return <section className="panel">
    <div className="panel-header"><h2>Fuel prices</h2>
      <Button onClick={() => setInitial({ effectiveDate: today(), pricePerLitre: '' })}>Set fuel price</Button>
    </div>
    <QueryResult query={prices}>{(history) => <div className="px-5 pb-4 text-sm">
      {history.length ? <ul className="divide-y divide-[var(--border)]">
        {history.map((price) => <li className="flex flex-wrap items-center justify-between gap-2 py-2" key={price.effectiveDate}>
          <span>{dateLabel(price.effectiveDate)} · {lkr(price.centsPerLitre)}/L</span>
          <Button onClick={() => setInitial({
            effectiveDate: price.effectiveDate, pricePerLitre: asDecimal(price.centsPerLitre),
          })}>Edit price</Button>
        </li>)}
      </ul> : <p className="text-muted">Set a fuel price before recording GPS litres.</p>}
    </div>}</QueryResult>
    {initial && <EditDialog title="Set fuel price" onClose={() => setInitial(undefined)}>
      <EditorForm fields={fields} initial={initial} onClose={() => setInitial(undefined)} onSubmit={async (values) => {
        await mutate('/fuel-prices', 'PUT', values);
        await queries.invalidateQueries({ queryKey: ['fleet', '/fuel-prices'] });
        setInitial(undefined);
      }}>
        <p className="mt-3 text-sm text-muted">The price applies from the selected date. Saved fuel entries keep their recorded price.</p>
      </EditorForm>
    </EditDialog>}
  </section>;
}
