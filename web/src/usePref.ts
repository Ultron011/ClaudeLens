import { useSearchParams } from 'react-router-dom';

/** A view preference kept in the URL (shareable, back-button correct), falling back to
 *  localStorage, falling back to `fallback`. URL always wins. Setting it clears `page` and
 *  replaces history so flipping a toggle doesn't pollute back/forward. */
export function usePref(key: string, fallback: string): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(`claudelens.${key}`);
  } catch {
    // private mode / disabled storage
  }
  const value = params.get(key) ?? stored ?? fallback;

  const set = (v: string) => {
    try {
      localStorage.setItem(`claudelens.${key}`, v);
    } catch {
      // private mode / disabled storage
    }
    const next = new URLSearchParams(params);
    next.set(key, v);
    next.delete('page');
    setParams(next, { replace: true });
  };

  return [value, set];
}
