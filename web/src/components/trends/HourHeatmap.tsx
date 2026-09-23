import { useState } from 'react';
import '../../styles.trends.css';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;

/** Sequential single-hue ramp: 5 steps from the sunken surface to the viz primary. Quantised
 *  against the max so one outlier hour doesn't wash every other cell to the lightest step. */
export function heatLevel(v: number, max: number): number {
  if (v <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((Math.sqrt(v) / Math.sqrt(max)) * 4)));
}

/** Short zone name for prose: "IST" / "EDT" where the locale has one, else the IANA city. */
export function tzShort(tz: string): string {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((x) => x.type === 'timeZoneName')?.value;
    if (p && !/^GMT[+-]/.test(p)) return p;
    if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'IST';
    return tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
  } catch {
    return tz;
  }
}

/** The shortest run of consecutive hours (wrapping past midnight) that holds ≥ `share` of all
 *  prompts — "mostly 10:00–19:00". Null when there's too little data to say anything. */
export function activeWindow(hours: number[][], share = 0.7): { start: number; end: number; frac: number } | null {
  const byHour = Array.from({ length: 24 }, (_, h) => hours.reduce((n, row) => n + (row[h] ?? 0), 0));
  const total = byHour.reduce((a, b) => a + b, 0);
  if (total < 10) return null;
  for (let len = 1; len <= 24; len++) {
    let best = -1;
    let bestStart = 0;
    for (let s = 0; s < 24; s++) {
      let sum = 0;
      for (let k = 0; k < len; k++) sum += byHour[(s + k) % 24];
      if (sum > best) {
        best = sum;
        bestStart = s;
      }
    }
    if (best >= total * share) return { start: bestStart, end: (bestStart + len) % 24, frac: best / total };
  }
  return null;
}

export function activeWindowText(hours: number[][], tz: string): string | null {
  const w = activeWindow(hours);
  if (!w) return null;
  return `mostly ${hh(w.start)}–${hh(w.end)} ${tzShort(tz)}`;
}

/** 7×24 hour-of-week grid of prompts in the viewer's timezone. Pointer hover and arrow keys move
 *  an active cell; the readout below announces it. The grid itself is one focusable element with
 *  an aria-label summary, not 168 tab stops. */
export function HourHeatmap({ hours, tz, what = 'prompts' }: { hours: number[][]; tz: string; what?: string }) {
  const [active, setActive] = useState<[number, number] | null>(null);
  const max = Math.max(0, ...hours.flat());
  const total = hours.flat().reduce((a, b) => a + b, 0);
  const dayTotals = hours.map((r) => r.reduce((a, b) => a + b, 0));
  const busiestDay = dayTotals.indexOf(Math.max(...dayTotals));
  let peak: [number, number] = [0, 0];
  hours.forEach((r, d) => r.forEach((v, h) => v > hours[peak[0]][peak[1]] && (peak = [d, h])));
  const win = activeWindowText(hours, tz);
  const summary =
    total === 0
      ? `No ${what} in this range`
      : `${total.toLocaleString()} ${what} by hour of week, ${tzShort(tz)}. Busiest day ${DAY_NAMES[busiestDay]}; peak hour ${DAY_NAMES[peak[0]]} ${hh(peak[1])}–${hh(peak[1] + 1)} with ${max}${win ? `; ${win}` : ''}. Use arrow keys to read cells.`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const [d, h] = active ?? [0, 0];
    const moves: Record<string, [number, number]> = {
      ArrowRight: [d, Math.min(23, h + 1)],
      ArrowLeft: [d, Math.max(0, h - 1)],
      ArrowDown: [Math.min(6, d + 1), h],
      ArrowUp: [Math.max(0, d - 1), h],
      Home: [d, 0],
      End: [d, 23],
    };
    if (e.key === 'Escape') return setActive(null);
    const next = moves[e.key];
    if (!next) return;
    e.preventDefault();
    setActive(active ? next : [d, h]);
  };

  return (
    <div className="hourmap">
      <div
        className="hourmap-grid"
        role="img"
        aria-label={summary}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setActive(null)}
      >
        <span className="hourmap-corner" aria-hidden />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={`h${h}`} className="hourmap-hour" aria-hidden>
            {h % 6 === 0 ? String(h).padStart(2, '0') : ''}
          </span>
        ))}
        {hours.map((row, d) => (
          <div key={d} className="hourmap-row" aria-hidden>
            <span className="hourmap-day">{DAYS[d]}</span>
            {row.map((v, h) => (
              <span
                key={h}
                className={active && active[0] === d && active[1] === h ? 'heat-cell is-active' : 'heat-cell'}
                data-level={heatLevel(v, max)}
                title={`${DAY_NAMES[d]} ${hh(h)}–${hh(h + 1)}: ${v} ${what}`}
                onPointerEnter={() => setActive([d, h])}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heat-foot">
        <div className="chart-readout" role="status" aria-live="polite">
          {active ? (
            <>
              <strong>
                {DAY_NAMES[active[0]]} {hh(active[1])}–{hh(active[1] + 1)}
              </strong>
              <span>
                {hours[active[0]][active[1]].toLocaleString()} {what}
              </span>
            </>
          ) : (
            <span>{win ? `${total.toLocaleString()} ${what} · ${win}` : `${total.toLocaleString()} ${what}`}</span>
          )}
        </div>
        <HeatLegend />
      </div>
    </div>
  );
}

export function HeatLegend() {
  return (
    <span className="heat-legend" aria-hidden>
      Less
      {[0, 1, 2, 3, 4].map((l) => (
        <span key={l} className="heat-cell" data-level={l} />
      ))}
      More
    </span>
  );
}
