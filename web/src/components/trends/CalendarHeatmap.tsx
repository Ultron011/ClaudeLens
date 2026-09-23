import { useMemo, useState } from 'react';
import { fmtDay } from '../../format.js';
import { HeatLegend, heatLevel } from './HourHeatmap.js';
import '../../styles.trends.css';

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const key = (t: number) => new Date(t).toISOString().slice(0, 10);

/** GitHub-style calendar: one column per week (Monday first), one row per weekday, UTC days
 *  (the parser's `daily` buckets — the same numbers as every "Messages per day" chart). Arrow keys
 *  move a day at a time (↑/↓) or a week (←/→); the readout announces the active day. */
export function CalendarHeatmap({
  from,
  to,
  days,
  what = 'messages',
}: {
  from: string;
  to: string;
  days: Array<{ day: string; messages: number; sessions: number }>;
  what?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const { cells, weeks, months, max, total, activeDays, best } = useMemo(() => {
    const byDay = new Map(days.map((d) => [d.day, d]));
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    const cells: Array<{ day: string; v: number; s: number; col: number; row: number }> = [];
    const lead = (new Date(start).getUTCDay() + 6) % 7; // server sends a Monday, but don't rely on it
    for (let t = start, i = 0; t <= end && i < 400; t += DAY_MS, i++) {
      const k = key(t);
      const d = byDay.get(k);
      const row = (new Date(t).getUTCDay() + 6) % 7;
      cells.push({ day: k, v: d?.messages ?? 0, s: d?.sessions ?? 0, col: Math.floor((i + lead) / 7), row });
    }
    const weeks = cells.length ? cells[cells.length - 1].col + 1 : 0;
    const months: Array<{ col: number; label: string }> = [];
    let last = -1;
    for (const c of cells) {
      const m = Number(c.day.slice(5, 7)) - 1;
      if (c.row === 0 && m !== last) {
        // skip a label that would collide with the previous one
        if (!months.length || c.col - months[months.length - 1].col >= 3) months.push({ col: c.col, label: MONTHS[m] });
        last = m;
      }
    }
    const max = Math.max(0, ...cells.map((c) => c.v));
    const total = cells.reduce((n, c) => n + c.v, 0);
    const activeDays = cells.filter((c) => c.v > 0).length;
    const best = cells.reduce<(typeof cells)[number] | null>((b, c) => (!b || c.v > b.v ? c : b), null);
    return { cells, weeks, months, max, total, activeDays, best };
  }, [from, to, days]);

  const summary =
    total === 0
      ? `No ${what} between ${fmtDay(from)} and ${fmtDay(to)}`
      : `${total.toLocaleString()} ${what} on ${activeDays} of ${cells.length} days, ${fmtDay(from)} to ${fmtDay(to)} (UTC)` +
        (best ? `; busiest ${fmtDay(best.day)} with ${best.v}` : '') +
        '. Use arrow keys to read days.';

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!cells.length) return;
    const i = active ?? cells.length - 1;
    const moves: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, ArrowRight: i + 7, ArrowLeft: i - 7, Home: 0, End: cells.length - 1 };
    if (e.key === 'Escape') return setActive(null);
    if (!(e.key in moves)) return;
    e.preventDefault();
    setActive(active == null ? cells.length - 1 : Math.min(cells.length - 1, Math.max(0, moves[e.key])));
  };

  const a = active != null ? cells[active] : null;
  return (
    <div className="calmap">
      <div className="calmap-scroll">
        <div
          className="calmap-grid"
          style={{ gridTemplateColumns: `auto repeat(${weeks}, var(--cal-cell))` }}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerLeave={() => setActive(null)}
        >
          <span style={{ gridRow: 1, gridColumn: 1 }} aria-hidden />
          {Array.from({ length: weeks }, (_, col) => (
            <span key={`m${col}`} className="calmap-month" style={{ gridRow: 1, gridColumn: col + 2 }} aria-hidden>
              {months.find((m) => m.col === col)?.label ?? ''}
            </span>
          ))}
          {['Mon', '', 'Wed', '', 'Fri', '', ''].map((l, row) => (
            <span key={`d${row}`} className="calmap-day" style={{ gridRow: row + 2, gridColumn: 1 }} aria-hidden>
              {l}
            </span>
          ))}
          {cells.map((c, i) => (
            <span
              key={c.day}
              aria-hidden
              className={active === i ? 'heat-cell is-active' : 'heat-cell'}
              data-level={heatLevel(c.v, max)}
              style={{ gridRow: c.row + 2, gridColumn: c.col + 2 }}
              title={`${fmtDay(c.day)}: ${c.v} ${what}, ${c.s} sessions`}
              onPointerEnter={() => setActive(i)}
            />
          ))}
        </div>
      </div>
      <div className="heat-foot">
        <div className="chart-readout" role="status" aria-live="polite">
          {a ? (
            <>
              <strong>{fmtDay(a.day)}</strong>
              <span>
                {a.v.toLocaleString()} {what} · {a.s} {a.s === 1 ? 'session' : 'sessions'}
              </span>
            </>
          ) : (
            <span>
              {total.toLocaleString()} {what} · active {activeDays} of {cells.length} days
            </span>
          )}
        </div>
        <HeatLegend />
      </div>
    </div>
  );
}
