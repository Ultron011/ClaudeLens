import { memo, useEffect, useRef, useState } from 'react';
import { ignoreShortcut } from './hooks.js';

const KEYS: [string[], string][] = [
  [['j'], 'Next prompt'],
  [['k'], 'Previous prompt'],
  [['/'], 'Find in transcript'],
  [['Enter', 'Shift Enter'], 'Next / previous match (in find)'],
  [['e'], 'Expand or collapse all'],
  [['o'], 'Prompt outline (narrow screens)'],
  [['←', '→'], 'Step prompts (timeline focused)'],
  [['?'], 'This help'],
  [['Esc'], 'Close'],
];

const LEGEND: [string, string][] = [
  ['tl-key-prompt', 'Your prompt'],
  ['tl-key-ask', 'Claude asked you a question'],
  ['tl-key-activity', 'Claude’s activity (turns + tool calls)'],
  ['tl-key-failed', 'Failed tool call'],
  ['tl-key-denied', 'Denied tool call'],
  ['tl-key-break', 'Idle for more than 10 minutes'],
  ['tl-key-view', 'On screen now'],
];

/** "?" chip + keyboard-shortcut dialog. Native <dialog> + showModal(), like ConfirmDialog: focus
 *  containment, Esc and ::backdrop for free. Owns its own open state (and the global `?` key) so
 *  opening it never re-renders the transcript. */
export const ShortcutsHelp = memo(function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // `?` is Shift+/ on most layouts, so ignoreShortcut's modifier check (no shiftKey) is right.
      if (e.key === '?' && !ignoreShortcut(e)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        className="chip icon kbd-chip"
        aria-label="Keyboard shortcuts (?)"
        title="Keyboard shortcuts (?)"
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      <dialog ref={ref} className="confirm-dialog shortcuts-dialog" onClose={() => setOpen(false)}>
        <h3>Keyboard shortcuts</h3>
        <dl className="shortcuts">
          {KEYS.map(([keys, what]) => (
            <div key={what}>
              <dt>
                {keys.map((k, n) => (
                  <span key={k}>
                    {n > 0 && <span className="muted"> / </span>}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
        <h4 className="shortcuts-sub">Timeline</h4>
        <ul className="tl-legend">
          {LEGEND.map(([cls, what]) => (
            <li key={cls}>
              <span className={`tl-key ${cls}`} aria-hidden />
              {what}
            </li>
          ))}
        </ul>
        <div className="confirm-actions">
          <button type="button" className="chip" autoFocus onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </dialog>
    </>
  );
});
