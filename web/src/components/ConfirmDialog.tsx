import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  /** When set, the confirm button stays disabled until the user types this exact string. */
  typeToConfirm?: string;
  /** May be async: the dialog shows a busy state while it runs and an inline error if it throws
   *  (the caller closes the dialog on success by flipping `open`). */
  onConfirm: () => void | Promise<void>;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
    if (open) {
      setTyped('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const disabled = busy || (!!typeToConfirm && typed !== typeToConfirm);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onCancel={(e) => (busy ? e.preventDefault() : onCancel())}
      onClose={onCancel}
    >
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
      {error && (
        <p className="confirm-error" role="alert">
          {error}
        </p>
      )}
      <div className="confirm-actions">
        <button type="button" className="chip" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="chip danger" disabled={disabled} onClick={confirm}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
