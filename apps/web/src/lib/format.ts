const wholeRupees = new Intl.NumberFormat('en-LK');
const recordDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function lkr(cents: string) {
  const amount = BigInt(cents);
  const absolute = amount < 0n ? -amount : amount;
  const fraction = (absolute % 100n).toString().padStart(2, '0');

  return `${amount < 0n ? '−' : ''}Rs. ${wholeRupees.format(absolute / 100n)}.${fraction}`;
}

export function dateLabel(date: string) {
  return recordDate.format(new Date(`${date}T00:00:00Z`));
}
