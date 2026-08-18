import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.js';
import { fmtDay } from '../format.js';
import { RANGE_PRESETS } from '../usePref.js';

export function DateRangePicker({
  range,
  customFrom,
  customTo,
  onApply,
}: {
  range: string;
  customFrom: string;
  customTo: string;
  onApply: (range: string, from?: string, to?: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [fromVal, setFromVal] = useState('');
  const [toVal, setToVal] = useState('');

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      const today = new Date().toISOString().slice(0, 10);
      const ago30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      setFromVal(customFrom || ago30);
      setToVal(customTo || today);
      dlg.showModal();
    }
    if (!open && dlg.open) dlg.close();
  }, [open]);

  const handleApply = () => {
    if (fromVal && toVal && fromVal <= toVal) {
      onApply('custom', fromVal, toVal);
      setOpen(false);
    }
  };

  const customLabel =
    range === 'custom' && customFrom && customTo
      ? `${fmtDay(customFrom)}–${fmtDay(customTo)}`
      : 'Custom';

  return (
    <>
      <div className="segmented" role="group" aria-label="Date range">
        {Object.keys(RANGE_PRESETS).map((r) => (
          <button key={r} type="button" aria-pressed={range === r} onClick={() => onApply(r)}>
            {r}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={range === 'custom'}
          className="dr-custom-btn"
          onClick={() => setOpen(true)}
        >
          <Icon name="calendar" size={12} />
          {customLabel}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="confirm-dialog dr-dialog"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
      >
        <h3>Custom date range</h3>
        <div className="dr-fields">
          <label className="dr-label">
            From
            <input
              type="date"
              value={fromVal}
              max={toVal || undefined}
              onChange={(e) => setFromVal(e.target.value)}
            />
          </label>
          <span className="dr-sep" aria-hidden="true">→</span>
          <label className="dr-label">
            To
            <input
              type="date"
              value={toVal}
              min={fromVal || undefined}
              onChange={(e) => setToVal(e.target.value)}
            />
          </label>
        </div>
        <div className="confirm-actions">
          <button type="button" className="chip" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="chip"
            disabled={!fromVal || !toVal || fromVal > toVal}
            onClick={handleApply}
          >
            Apply
          </button>
        </div>
      </dialog>
    </>
  );
}
