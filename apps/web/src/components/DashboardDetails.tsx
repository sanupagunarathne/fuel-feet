import { useState } from 'react';
import type { ReactNode } from 'react';

export function DashboardDetails({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <details className="panel" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer px-5 py-3 font-semibold">Charts and recent records</summary>
      {open && <div className="dashboard-grid px-3 pb-3 sm:px-5 sm:pb-5">{children}</div>}
    </details>
  );
}
