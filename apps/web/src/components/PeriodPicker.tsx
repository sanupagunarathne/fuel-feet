import { useState } from 'react';
import { CalendarDays, ChevronDown, X } from 'lucide-react';
import { currentPeriod, isPeriod, periodLabel } from '../lib/period';
import { Modal } from './Modal';
import { Button } from './ui';

export function PeriodPicker({ period, onChange }: { period: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(period);
  const [year, setYear] = useState(period.slice(0, 4));
  const displayYear = /^[1-9][0-9]{3}$/.test(year) ? year : currentPeriod().slice(0, 4);
  const choices = Array.from({ length: 12 }, (_, index) => `${displayYear}-${String(index + 1).padStart(2, '0')}`);
  const chosen = `${year}-${selected.slice(5)}`;

  return (
    <>
      <Button aria-haspopup="dialog" onClick={() => { setSelected(period); setYear(period.slice(0, 4)); setOpen(true); }}>
        <CalendarDays size={17} aria-hidden="true" />
        <span>{periodLabel(period)}</span>
        <ChevronDown size={15} aria-hidden="true" className="text-muted" />
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} label="Reporting period">
        <form onSubmit={(event) => { event.preventDefault(); if (isPeriod(chosen)) { onChange(chosen); setOpen(false); } }}>
          <div className="dialog-heading">
            <h2>Reporting period</h2>
            <Button variant="icon" aria-label="Close reporting period" onClick={() => setOpen(false)}>
              <X size={19} aria-hidden="true" />
            </Button>
          </div>
          <label className="field-label mb-3">
            Year
            <input className="select-field mt-2 w-full" value={year} inputMode="numeric" pattern="[1-9][0-9]{3}"
              maxLength={4} required onChange={(event) => setYear(event.target.value)} />
          </label>
          <label className="field-label">
            Month
            <select className="select-field mt-2 w-full" value={`${displayYear}-${selected.slice(5)}`} onChange={(event) => setSelected(event.target.value)}>
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
