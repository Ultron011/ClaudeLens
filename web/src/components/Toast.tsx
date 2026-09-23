import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Kind = 'error' | 'ok';
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

const ToastCtx = createContext<(text: string, kind?: Kind) => void>(() => {});

/** `const toast = useToast(); toast('Couldn’t delete', 'error')`. Fire-and-forget feedback for
 *  mutations — before this, a failed feature/delete did nothing visible at all. */
export const useToast = () => useContext(ToastCtx);

/** Error text for a caught value, whatever was thrown. */
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, kind: Kind = 'ok') => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, kind, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {/* One live region, always mounted, so screen readers announce each new message. */}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss"
              onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
