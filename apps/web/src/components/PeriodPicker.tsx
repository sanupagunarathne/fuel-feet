import { useState } from 'react';
import { CalendarDays, ChevronDown, X } from 'lucide-react';
import { currentPeriod, periodLabel, shiftPeriod } from '../lib/period';
import { Modal } from './Modal';
import { Button } from './ui';

export function PeriodPicker({ period, onChange }: { period: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(period);
  const current = currentPeriod();
  const choices = Array.from({ length: 12 }, (_, index) => shiftPeriod(current, -index));
  if (!choices.includes(period)) choices.unshift(period);

  return (
    <>
      <Button aria-haspopup="dialog" onClick={() => { setSelected(period); setOpen(true); }}>
        <CalendarDays size={17} aria-hidden="true" />
        <span>{periodLabel(period)}</span>
        <ChevronDown size={15} aria-hidden="true" className="text-muted" />
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} label="Reporting period">
        <form onSubmit={(event) => { event.preventDefault(); onChange(selected); setOpen(false); }}>
          <div className="dialog-heading">
            <h2>Reporting period</h2>
            <Button variant="icon" aria-label="Close reporting period" onClick={() => setOpen(false)}>
              <X size={19} aria-hidden="true" />
            </Button>
          </div>
          <label className="field-label">
            Month
            <select className="select-field mt-2 w-full" value={selected} onChange={(event) => setSelected(event.target.value)}>
              {choices.map((value) => <option key={value} value={value}>{periodLabel(value)}</option>)}
            </select>
          </label>
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Apply period</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
