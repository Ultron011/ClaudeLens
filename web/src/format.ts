import type { SessionStats } from '@claudelens/shared';

/** Genuine human message count — the headline metric (§10). `userMessages` is undefined on
 *  sessions synced before this existed (`parser_version` 0-2, which stored the same idea under
 *  the old name `userTurns`). Fall back to that, then 0 — never render NaN/undefined. */
export const msgCount = (stats: SessionStats) =>
  stats.userMessages ?? (stats as unknown as { userTurns?: number }).userTurns ?? 0;

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** `$53,702.33`; sub-cent values keep 4 decimals so tiny sessions don't all read `$0.00`. */
export const fmtCost = (n: number | string | null | undefined) => {
  const v = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  if (!v) return '$0';
  return v >= 0.01 ? USD.format(v) : `$${v.toFixed(4)}`;
};

/** Accepts the bigint-as-string values node-postgres returns (see gotchas.md). */
export const fmtTokens = (raw: number | string) => {
  const n = Number(raw) || 0;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

// Cached formatters: Date#toLocale*String builds a new Intl formatter on EVERY call, which made a
// 1,500-turn transcript (two stamps per turn) take ~4 s to re-render on "Expand all".
const DAY_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const DAY_YEAR_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const DATETIME_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const THIS_YEAR = new Date().getFullYear();

/** Month + day, plus the year once it isn't this year — "Mar 4" alone is ambiguous in a history. */
export const fmtDate = (s?: string) => {
  if (!s) return '';
  const d = new Date(s);
  return (d.getFullYear() === THIS_YEAR ? DAY_FMT : DAY_YEAR_FMT).format(d);
};

/** Clock time only, e.g. "14:03" — for per-turn stamps inside a session. */
export const fmtTime = (s?: string) => (s ? TIME_FMT.format(new Date(s)) : '');

export const fmtDateTime = (s?: string) => (s ? DATETIME_FMT.format(new Date(s)) : '');

/** `daily` keys are 'YYYY-MM-DD' UTC calendar days — parsing them with `new Date(s)` reads them
 *  as local midnight, which is off by one day in any timezone behind UTC. Parse and render as UTC. */
export const fmtDay = (s: string) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

export const fmtDuration = (ms?: number) => {
  if (!ms || ms < 0) return '';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
