import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function Modal({ open, onClose, label, drawer = false, children }: {
  open: boolean;
  onClose: () => void;
  label: string;
  drawer?: boolean;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      className={drawer ? 'dialog dialog--drawer' : 'dialog'}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="dialog-content">{children}</div>
    </dialog>
  );
}
