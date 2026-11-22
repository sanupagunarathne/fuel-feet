const businessZone = 'Asia/Colombo';
const periodLabelFormatter = new Intl.DateTimeFormat('en-LK', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthLabelFormatter = new Intl.DateTimeFormat('en-LK', {
  month: 'short',
  timeZone: 'UTC',
});

export function currentPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    timeZone: businessZone,
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;

  return `${year}-${month}`;
}

export function isPeriod(value: string | null): value is string {
  return value !== null && /^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftPeriod(period: string, offset: number) {
  const date = new Date(`${period}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function periodLabel(period: string) {
  return periodLabelFormatter.format(new Date(`${period}-01T00:00:00Z`));
}

export function monthLabel(period: string) {
  return monthLabelFormatter.format(new Date(`${period}-01T00:00:00Z`));
}
