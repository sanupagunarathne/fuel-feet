import { crewRoles, expenseCategories } from '@fuel-feet/shared';

export type Entity = Record<string, string | number | boolean | null | undefined> & { id: string };
export type Option = { value: string; label: string };
export type Field = {
  name: string;
  label: string;
  kind?: 'text' | 'textarea' | 'date' | 'month' | 'number' | 'money' | 'select' | 'boolean';
  optional?: boolean;
  options?: Option[];
  initial?: string;
};

export function label(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (first) => first.toUpperCase());
}

export const roles = crewRoles.map((value) => ({ value, label: label(value) }));
export const categories = expenseCategories.map((value) => ({ value, label: label(value) }));
export const tripStates = ['DRAFT', 'CONFIRMED', 'VOIDED'].map((value) => ({ value, label: label(value) }));
const notes: Field = { name: 'notes', label: 'Notes', kind: 'textarea', optional: true };

export const vehicleFields: Field[] = [
  { name: 'registration', label: 'Registration number' },
  { name: 'nickname', label: 'Vehicle name', optional: true },
  { name: 'make', label: 'Make', optional: true },
  { name: 'model', label: 'Model', optional: true },
  { name: 'year', label: 'Year', kind: 'number', optional: true },
  { name: 'active', label: 'Active vehicle', kind: 'boolean', initial: 'true' }, notes,
];
export const employeeFields: Field[] = [
  { name: 'fullName', label: 'Full name' },
  { name: 'role', label: 'Crew role', kind: 'select', options: roles },
  { name: 'phone', label: 'Contact number', optional: true },
  { name: 'defaultRateBps', label: 'Salary rate (%)', kind: 'money' },
  { name: 'active', label: 'Active employee', kind: 'boolean', initial: 'true' }, notes,
];
export const distributorFields: Field[] = [
  { name: 'name', label: 'Distributor name' }, { name: 'active', label: 'Active distributor', kind: 'boolean', initial: 'true' },
];
export const settingsFields: Field[] = [
  { name: 'businessName', label: 'Business name' }, { name: 'contact', label: 'Business contact', optional: true },
  { name: 'address', label: 'Business address', kind: 'textarea', optional: true },
];
export const reasonField: Field = { name: 'reason', label: 'Reason for change', kind: 'textarea' };

export function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function asDecimal(cents: string) {
  return cents.padStart(3, '0').replace(/(\d{2})$/, '.$1');
}

export function inputValues(fields: Field[], initial: Record<string, unknown> = {}) {
  return Object.fromEntries(fields.map(({ name, initial: fallback }) => [name, String(initial[name] ?? fallback ?? '')]));
}

export function recordPayload(fields: Field[], values: Record<string, string>) {
  return Object.fromEntries(fields.map(({ name, kind, optional }) => {
    const value = values[name]?.trim() ?? '';
    if (kind === 'boolean') return [name, value === 'true'];
    if (optional && !value) return [name, null];
    if (name === 'defaultRateBps') {
      if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) throw new Error('Enter a salary rate with up to two decimal places.');
      const [whole, fraction = ''] = value.split('.');
      return [name, Number(whole) * 100 + Number(fraction.padEnd(2, '0'))];
    }
    return [name, kind === 'number' ? Number(value) : value];
  }));
}
