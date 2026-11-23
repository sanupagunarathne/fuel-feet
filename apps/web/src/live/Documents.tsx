import { useContext, useState } from 'react';
import { Button } from '../components/ui';
import { FleetToken, fleetRequest, message, useFleetQuery } from './client';
import { QueryResult } from './components';

type Attachment = { id: string; filename: string; byteSize: number };

export async function download(response: Response, filename: string) {
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function Documents({ page, id }: { page: 'trips' | 'expenses'; id: string }) {
  const token = useContext(FleetToken);
  const path = `/${page}/${id}/attachments`;
  const files = useFleetQuery<Attachment[]>(path);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  async function run(work: () => Promise<void>) {
    setError(''); setStatus(''); setPending(true);
    try { await work(); } catch (failure) { setError(message(failure)); } finally { setPending(false); }
  }

  return <>
    <QueryResult query={files}>{(rows) => rows.length ? <ul className="mb-4 divide-y divide-[var(--border)]">
      {rows.map((file) => <li key={file.id} className="flex items-center justify-between gap-2 py-2">
        <span className="break-all text-sm">{file.filename}</span>
        <Button disabled={pending} onClick={() => void run(async () => {
          await download(await fleetRequest(token, `/attachments/${file.id}/download`), file.filename);
        })}>Download</Button>
      </li>)}
    </ul> : <p className="mb-4 text-sm text-muted">No documents attached.</p>}</QueryResult>
    <form onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body = new FormData(form);
      void run(async () => {
        await fleetRequest(token, path, { method: 'POST', body, headers: { 'Idempotency-Key': crypto.randomUUID() } });
        form.reset();
        await files.refetch();
        setStatus('Document uploaded.');
      });
    }}>
      <label className="field-label">PDF, JPEG or PNG<input className="select-field mt-1 w-full"
        type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required disabled={pending} /></label>
      <Button className="mt-3" type="submit" variant="primary" disabled={pending}>{pending ? 'Working…' : 'Upload document'}</Button>
    </form>
    {status && <p role="status" className="mt-3 text-sm">{status}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
  </>;
}
