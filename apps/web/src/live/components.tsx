import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Modal } from '../components/Modal';
import { Button, Feedback } from '../components/ui';
import { message } from './client';
import type { Field } from './fields';

export function QueryResult<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <Feedback kind="loading" title="Loading records" />;
  if (query.isError) return <Feedback kind="error" title="Could not load records" description={message(query.error)}
    action={<Button onClick={() => void query.refetch()}>Retry</Button>} />;
  return children(query.data);
}

export function EditDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <Modal open onClose={onClose} label={title}>
    <div className="dialog-heading">
      <h2>{title}</h2>
      <Button variant="icon" aria-label="Close dialog" onClick={onClose}><X size={19} aria-hidden="true" /></Button>
    </div>
    {children}
  </Modal>;
}

export function Fields({ fields, values, onChange, disabled }: {
  fields: Field[]; values: Record<string, string>; onChange: (name: string, value: string) => void; disabled?: boolean;
}) {
  return <fieldset className="editor-fields" disabled={disabled}>
    {fields.map(({ name, label, kind, options, optional }) => {
      const value = values[name] ?? '';
      const attributes = { value, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        onChange(name, event.target.value), required: !optional, className: 'select-field mt-1 w-full' };
      return <label className={`field-label ${kind === 'textarea' ? 'editor-wide' : ''}`} key={name}>
        {kind !== 'boolean' && label}
        {kind === 'boolean' ? (
          <span className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={value === 'true'} onChange={(event) => onChange(name, String(event.target.checked))} />{label}
          </span>
        ) : kind === 'select' ? (
          <select {...attributes}><option value="">{optional ? 'None' : 'Select…'}</option>
            {options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : kind === 'textarea' ? <textarea rows={3} maxLength={2000} {...attributes} />
          : <input {...attributes} type={kind === 'money' || kind === 'decimal' ? 'text' : kind ?? 'text'}
            inputMode={kind === 'money' || kind === 'decimal' ? 'decimal' : undefined} maxLength={kind === 'money' ? 15 : kind === 'decimal' ? 19 : 150} />}
      </label>;
    })}
  </fieldset>;
}

export function EditorForm({ fields, initial, onSubmit, onClose, submitLabel = 'Save', children, onPreview, loadDefaults, autoDefaults }: {
  fields: Field[]; initial: Record<string, string>; onSubmit: (values: Record<string, string>) => Promise<void>;
  onClose: () => void; submitLabel?: string;
  onPreview?: (values: Record<string, string>) => Promise<ReactNode>;
  children?: ReactNode;
  autoDefaults?: boolean;
  loadDefaults?: (values: Record<string, string>) => Promise<Record<string, string>>;
}) {
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ReactNode>(null);
  const ref = useId();
  async function run(work: () => Promise<unknown>) {
    setPending(true);
    setError('');
    try { await work(); } catch (failure) { setError(message(failure)); } finally { setPending(false); }
  }
  return <form id={ref} onSubmit={(event) => {
    event.preventDefault();
    const wantsPreview = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'preview';
    void run(async () => {
      if (wantsPreview && onPreview) setPreview(await onPreview(values));
      else await onSubmit(values);
    });
  }}>
    <Fields fields={fields} values={values} onChange={(name, value) => {
      const next = { ...values, [name]: value };
      setValues(next);
      setPreview(null);
      if (autoDefaults && loadDefaults && (name === 'vehicleId' || name === 'tripDate') && next.vehicleId && next.tripDate) {
        void run(async () => setValues({ ...next, ...await loadDefaults(next) }));
      }
    }} disabled={pending} />
    {loadDefaults && <Button className="mt-3" disabled={pending} onClick={() => void run(async () => {
      const defaults = await loadDefaults(values);
      setValues({ ...values, ...defaults });
      setPreview(null);
    })}>Use regular crew</Button>}
    {children}
    {preview && <div className="mt-4" role="status">{preview}</div>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <Button onClick={onClose} disabled={pending}>Cancel</Button>
      {onPreview && <Button type="submit" value="preview" disabled={pending}>Review earnings</Button>}
      <Button variant="primary" type="submit" disabled={pending || Boolean(onPreview && !preview)}>{pending ? 'Working…' : submitLabel}</Button>
    </div>
  </form>;
}
