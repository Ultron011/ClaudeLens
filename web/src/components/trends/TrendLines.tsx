import { useLayoutEffect, useRef, useState } from 'react';
import { niceTicks } from '../../charts/Chart.js';
import '../../styles.trends.css';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  /** null = no data for that period — the line breaks rather than dropping to zero */
  values: Array<number | null>;
}

/** Measured container width, so the viewBox is authored in real pixels (gotchas #8). */
function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth > 0) setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) setW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Overlapping (NOT stacked) lines on one y-axis — for rates and ratios, where `Chart.tsx`'s
 *  stacking would be meaningless (two models' cache-hit rates don't add up to anything).
 *
 *  `zero={false}` lets the axis start near the data: a cache-hit rate living between 93% and 99%
 *  is a flat line on a 0–100% axis, and a line chart (unlike bars) doesn't need a zero baseline
 *  to be read honestly. Crosshair by pointer and keyboard (←/→, Escape), same as `Chart`. */
export function TrendLines({
  labels,
  series,
  height = 180,
  ariaLabel,
  format,
  zero = true,
  legend,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  ariaLabel: string;
  format: (v: number) => string;
  zero?: boolean;
  /** force the legend on (e.g. a per-model view that happens to have one line); default ≥ 2 series */
  legend?: boolean;
}) {
  const [wrapRef, W] = useWidth();
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const n = labels.length;
  const padL = 52;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const innerW = Math.max(10, W - padL - padR);
  const innerH = height - padT - padB;

  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null && Number.isFinite(v)));
  const hi = all.length ? Math.max(...all) : 0;
  const lo = all.length ? Math.min(...all) : 0;
  let base = 0;
  let ticks: number[];
  if (!zero && all.length && lo > 0 && hi > lo && lo > hi * 0.4) {
    // Start the axis at a nice step below the minimum.
    const span = niceTicks(hi - lo, 3);
    const step = span.length > 1 ? span[1] - span[0] : hi - lo;
    base = Math.floor(lo / step) * step;
    ticks = [];
    for (let v = base; v <= hi + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    if (ticks[ticks.length - 1] < hi) ticks.push(ticks[ticks.length - 1] + step);
  } else {
    ticks = niceTicks(hi);
  }
  const top = ticks[ticks.length - 1] || 1;
  const yFor = (v: number) => padT + innerH - ((v - base) / (top - base || 1)) * innerH;
  const xFor = (i: number) => padL + (n > 1 ? (i * innerW) / (n - 1) : innerW / 2);

  const moveTo = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const i = n > 1 ? Math.round(((x - padL) / innerW) * (n - 1)) : 0;
    setActive(Math.min(n - 1, Math.max(0, i)));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (n === 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActive((i) => Math.min(n - 1, (i ?? -1) + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((i) => Math.max(0, (i ?? n) - 1));
    } else if (e.key === 'Escape') setActive(null);
  };

  // Label density from measured width, first/last anchored inward (same rules as Chart.tsx).
  const capacity = Math.max(2, Math.floor(innerW / 58));
  const step = Math.max(1, Math.ceil(n / capacity));

  return (
    <div className="chart trend-lines" ref={wrapRef} onKeyDown={onKeyDown}>
      <svg
        ref={svgRef}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        viewBox={`0 0 ${W} ${height}`}
        width={W}
        height={height}
        onPointerMove={(e) => moveTo(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={padL - 8} y={yFor(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--text-faint)">
              {format(t)}
            </text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--viz-axis)" strokeWidth={1} />

        {series.map((s) => {
          const segs: string[] = [];
          const dots: number[] = [];
          let open = false;
          s.values.forEach((v, i) => {
            if (v == null || !Number.isFinite(v)) {
              open = false;
              return;
            }
            segs.push(`${open ? 'L' : 'M'}${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`);
            // An isolated point (no neighbour on either side) would draw nothing as a path.
            const prev = s.values[i - 1];
            const next = s.values[i + 1];
            if ((prev == null || i === 0) && (next == null || i === n - 1)) dots.push(i);
            open = true;
          });
          return (
            <g key={s.key}>
              <path d={segs.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {dots.map((i) => (
                <circle key={i} cx={xFor(i)} cy={yFor(s.values[i] as number)} r={3} fill={s.color} />
              ))}
            </g>
          );
        })}

        {active != null && (
          <g>
            <line x1={xFor(active)} x2={xFor(active)} y1={padT} y2={padT + innerH} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s) => {
              const v = s.values[active];
              return v == null ? null : (
                <circle key={s.key} cx={xFor(active)} cy={yFor(v)} r={4} fill={s.color} stroke="var(--bg-card)" strokeWidth={2} />
              );
            })}
          </g>
        )}

        {labels.map((l, i) => {
          if (i !== 0 && i !== n - 1 && i % step !== 0) return null;
          if (i !== 0 && i !== n - 1 && n - 1 - i < step / 2) return null;
          const anchor = n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
          return (
            <text key={i} x={xFor(i)} y={height - 6} textAnchor={anchor} fontSize={10} fill="var(--text-faint)">
              {l}
            </text>
          );
        })}
      </svg>

      <div className="chart-readout" role="status" aria-live="polite">
        {active != null && n > 0 && (
          <>
            <strong>{labels[active]}</strong>
            {series.map((s) => (
              <span key={s.key}>
                <i style={{ background: s.color }} aria-hidden />
                {s.label}: {s.values[active] == null ? '—' : format(s.values[active] as number)}
              </span>
            ))}
          </>
        )}
      </div>

      {(legend ?? series.length >= 2) && series.length > 0 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
