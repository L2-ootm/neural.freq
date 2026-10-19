import { useEffect, useRef, type ReactNode } from 'react';

/** Modal built on the native <dialog>: focus trap, inert background and Escape come from the platform. */
export function Dialog({
  open,
  onClose,
  labelledBy,
  warn,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  warn?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={warn ? 'warn' : undefined}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && <div className="dialog-body">{children}</div>}
    </dialog>
  );
}
