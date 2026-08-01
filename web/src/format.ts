import type { SessionStats } from '@claudelens/shared';

/** Genuine human message count — the headline metric (§10). `userMessages` is undefined on
 *  sessions synced before this existed (`parser_version` 0-2, which stored the same idea under
 *  the old name `userTurns`). Fall back to that, then 0 — never render NaN/undefined. */
export const msgCount = (stats: SessionStats) =>
  stats.userMessages ?? (stats as unknown as { userTurns?: number }).userTurns ?? 0;

export const fmtCost = (n: number | string | null | undefined) => {
  const v = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  if (!v) return '$0';
  return v >= 0.01 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`;
};

export const fmtTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

export const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

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
