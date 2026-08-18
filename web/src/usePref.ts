import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export const RANGE_PRESETS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** The one phone breakpoint. Kept in lockstep with the `max-width: 720px` blocks in
 *  `styles.css` / `styles.extra.css` — if this number and those queries ever drift, the JS
 *  default and the CSS layout disagree about what "mobile" means. */
export const NARROW_QUERY = '(max-width: 720px)';

/** True on a phone-width viewport, and stays true-to-life across rotation/resize.
 *  Read synchronously on first render so there is no card-then-table flip after mount. */
export function useIsNarrow(): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [narrow, setNarrow] = useState(() => (supported ? window.matchMedia(NARROW_QUERY).matches : false));

  useEffect(() => {
    if (!supported) return;
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [supported]);

  return narrow;
}

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

/** The shared `layout` preference, with a viewport-aware default: **cards on a phone, table on a
 *  wide screen**. A table is a two-axis object and a 390px viewport only has one axis to spend,
 *  so the card is the honest default there.
 *
 *  This is a change of *fallback* only — `usePref`'s precedence is unchanged, so a `?layout=` in
 *  the URL or a stored pick from the toggle still wins at every width. Someone who deliberately
 *  chooses Table on their phone keeps it. */
/** Unified date-range preference. Manages the `range` URL/localStorage key plus the `from`/`to`
 *  URL params used when `range === 'custom'`. The `apply` setter writes all three atomically so
 *  there is never a frame where `range=custom` but `from`/`to` are absent. */
export function useDateRange() {
  const [params, setParams] = useSearchParams();
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('claudelens.range');
  } catch {}
  let storedFrom: string | null = null, storedTo: string | null = null;
  try {
    storedFrom = localStorage.getItem('claudelens.range_from');
    storedTo = localStorage.getItem('claudelens.range_to');
  } catch {}
  const range = params.get('range') ?? stored ?? '30d';
  const customFrom = params.get('from') ?? storedFrom ?? '';
  const customTo = params.get('to') ?? storedTo ?? '';

  let from: Date, to: Date;
  if (range === 'custom' && customFrom && customTo) {
    from = new Date(customFrom + 'T00:00:00Z');
    to = new Date(customTo + 'T23:59:59Z');
  } else {
    const days = RANGE_PRESETS[range] ?? 30;
    to = new Date();
    from = new Date(to.getTime() - days * 86_400_000);
  }

  const apply = (newRange: string, newFrom?: string, newTo?: string) => {
    try {
      localStorage.setItem('claudelens.range', newRange);
    } catch {}
    const next = new URLSearchParams(params);
    next.set('range', newRange);
    next.delete('page');
    if (newRange === 'custom' && newFrom && newTo) {
      next.set('from', newFrom);
      next.set('to', newTo);
      try {
        localStorage.setItem('claudelens.range_from', newFrom);
        localStorage.setItem('claudelens.range_to', newTo);
      } catch {}
    } else {
      next.delete('from');
      next.delete('to');
    }
    setParams(next, { replace: true });
  };

  return { range, from, to, customFrom, customTo, apply };
}

export function useLayoutPref(): ['cards' | 'table', (v: string) => void] {
  const narrow = useIsNarrow();
  const [raw, set] = usePref('layout', narrow ? 'cards' : 'table');
  return [raw === 'cards' ? 'cards' : 'table', set];
}
