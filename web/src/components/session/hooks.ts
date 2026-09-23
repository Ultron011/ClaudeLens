import { useEffect, useState } from 'react';

/** True while typing in a field, or when a modifier is held — single-key shortcuts must stay out
 *  of the way of both (the pattern SessionPage's j/k handler established). */
export const ignoreShortcut = (e: KeyboardEvent) =>
  e.metaKey ||
  e.ctrlKey ||
  e.altKey ||
  !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]');

/** Live `matchMedia` flag. `usePref.ts`'s `useIsNarrow` is the same idea pinned to 720px; this one
 *  takes the query because the outline's side column wants its own breakpoint. */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setOn(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return on;
}

export interface VisibleRange {
  /** First turn whose bottom edge is below the sticky transcript bar. */
  first: number;
  /** Last turn whose top edge is above the bottom of the viewport. */
  last: number;
}

/** Which turns (`#t-<i>` in document order) are on screen now.
 *
 * Deliberately a binary search over `getBoundingClientRect` rather than an IntersectionObserver
 * over every turn: turns are in document order, so their rects are monotone, and ~2·log2(1,538) ≈
 * 22 rect reads per frame is cheaper than keeping 1,500 observer entries (and it works through
 * `content-visibility: auto`, whose skipped turns still have their placeholder boxes).
 * rAF-throttled; state only changes when the range does, so a scroll within one turn re-renders
 * nothing. Consumers must be small components — never SessionPage itself, whose re-render walks
 * every turn. */
export function useVisibleRange(count: number): VisibleRange {
  const [range, setRange] = useState<VisibleRange>({ first: 0, last: 0 });
  useEffect(() => {
    if (!count) return;
    let raf = 0;
    const rectOf = (i: number) => document.getElementById(`t-${i}`)?.getBoundingClientRect();
    /** Smallest i in [0, count] whose `edge` is past `y`. A missing element counts as "not past". */
    const search = (y: number, edge: 'top' | 'bottom') => {
      let lo = 0;
      let hi = count;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const r = rectOf(mid);
        if (r && r[edge] > y) hi = mid;
        else lo = mid + 1;
      }
      return lo;
    };
    const measure = () => {
      raf = 0;
      const bar = document.querySelector('.transcript-bar');
      const top = bar ? bar.getBoundingClientRect().bottom : 0;
      const first = Math.min(search(top, 'bottom'), count - 1);
      const last = Math.max(first, Math.min(search(innerHeight - 1, 'top'), count) - 1);
      setRange((r) => (r.first === first && r.last === last ? r : { first, last }));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    schedule();
    // Capture, so a scroll on any scroller reaches us (scroll events don't bubble).
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    addEventListener('resize', schedule);
    // Expand/Collapse-all and content-visibility settling change heights without a scroll.
    const transcript = document.querySelector('.transcript');
    const ro = transcript ? new ResizeObserver(schedule) : null;
    if (transcript) ro?.observe(transcript);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('scroll', schedule, { capture: true });
      removeEventListener('resize', schedule);
      ro?.disconnect();
    };
  }, [count]);
  return range;
}

/** Index into sorted `arr` of the last element <= v, or -1. */
export function lastAtOrBefore(arr: ArrayLike<number>, v: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** First non-blank line of a message, code fences named rather than shown, clipped for a label. */
export function firstLine(text: string, max = 100): string {
  const line = (text.split('\n').find((l) => l.trim()) ?? '').trim().replace(/^`{3}.*$/, '(code)');
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
