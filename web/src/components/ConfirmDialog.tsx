import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  /** When set, the confirm button stays disabled until the user types this exact string. */
  typeToConfirm?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Native <dialog> + showModal() — modal focus containment, Esc, inertness and ::backdrop for
 *  free. No hand-rolled overlay/focus trap. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  typeToConfirm,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
    if (open) setTyped('');
  }, [open]);

  const disabled = !!typeToConfirm && typed !== typeToConfirm;

  return (
    <dialog ref={ref} className="confirm-dialog" onCancel={onCancel} onClose={onCancel}>
      <h3>{title}</h3>
      <div className="confirm-body">{body}</div>
      {typeToConfirm && (
        <label className="confirm-type">
          Type <code>{typeToConfirm}</code> to confirm
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label={`Type ${typeToConfirm} to confirm`}
          />
        </label>
      )}
      <div className="confirm-actions">
        <button type="button" className="chip" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="chip danger" disabled={disabled} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
