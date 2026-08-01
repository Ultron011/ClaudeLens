import { useRef, useState } from 'react';

export interface Series {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
}

/** Hand-rolled inline-SVG chart: a stacked area ("line") or stacked columns ("bars") on one
 * y-axis. Multiple series stack (never a second axis); a single series is just itself. Ticks
 * follow a 1/2/5×10^k ladder. Crosshair works by pointer and by keyboard (ArrowLeft/Right,
 * Escape clears) — see `references/interaction.md` in the dataviz skill. */
export function Chart({
  kind,
  labels,
  series,
  height = 200,
  ariaLabel,
}: {
  kind: 'line' | 'bars';
  labels: string[];
  series: Series[];
  height?: number;
  ariaLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const n = labels.length;
  const W = 640;
  const padL = 44;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;

  const at = (v: number | null) => v ?? 0;
  const totals = n === 0 ? [0] : labels.map((_, i) => series.reduce((s, ser) => s + at(ser.values[i]), 0));
  const ticks = niceTicks(Math.max(0, ...totals));
  const scaleMax = ticks[ticks.length - 1] || 1;
  const yFor = (v: number) => padT + innerH - (v / scaleMax) * innerH;

  const bandW = innerW / Math.max(n, 1);
  const xBand = (i: number) => padL + i * bandW;
  const xPoint = (i: number) => padL + (n > 1 ? (i * innerW) / (n - 1) : innerW / 2);

  const moveTo = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const i = kind === 'bars' ? Math.floor((x - padL) / bandW) : Math.round(((x - padL) / innerW) * (n - 1));
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
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };

  // Stacked bands: cumulative baseline per series, per index.
  const cumBefore = series.map((_, si) =>
    labels.map((_, i) => series.slice(0, si).reduce((s, ser) => s + at(ser.values[i]), 0)),
  );

  return (
    <div className="chart" onKeyDown={onKeyDown}>
      <svg
        ref={svgRef}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        height={height}
        onPointerMove={(e) => moveTo(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={padL - 8} y={yFor(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--text-faint)">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        <line x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke="var(--viz-axis)" strokeWidth={1} />
        <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--viz-axis)" strokeWidth={1} />

        {n > 0 &&
          series.map((s, si) =>
            kind === 'bars' ? (
              <g key={s.key}>
                {labels.map((_, i) => {
                  const base = cumBefore[si][i];
                  const v = at(s.values[i]);
                  const y0 = yFor(base);
                  const y1 = yFor(base + v);
                  return (
                    <rect
                      key={i}
                      x={xBand(i) + 1}
                      y={Math.min(y0, y1)}
                      width={Math.max(bandW - 2, 0)}
                      height={Math.max(Math.abs(y0 - y1), 0)}
                      fill={s.color}
                    />
                  );
                })}
              </g>
            ) : (
              <path key={s.key} d={areaPath(labels, s, cumBefore[si], at, xPoint, yFor)} fill={s.color} fillOpacity={0.55} stroke={s.color} strokeWidth={2} />
            ),
          )}

        {active != null && (
          <line
            x1={kind === 'bars' ? xBand(active) + bandW / 2 : xPoint(active)}
            x2={kind === 'bars' ? xBand(active) + bandW / 2 : xPoint(active)}
            y1={padT}
            y2={padT + innerH}
            stroke="var(--text-faint)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {n > 0 &&
          labels.map((l, i) => {
            const step = Math.max(1, Math.ceil(n / 8));
            if (i !== 0 && i !== n - 1 && i % step !== 0) return null;
            return (
              <text key={i} x={xBand(i) + bandW / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--text-faint)">
                {l}
              </text>
            );
          })}
      </svg>

      {active != null && n > 0 && (
        <div className="chart-readout" role="status" aria-live="polite">
          <strong>{labels[active]}</strong>
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} aria-hidden />
              {s.label}: {(series.length === 1 ? totals[active] : at(s.values[active])).toLocaleString()}
            </span>
          ))}
        </div>
      )}

      {series.length >= 2 && (
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

function areaPath(
  labels: string[],
  s: Series,
  base: number[],
  at: (v: number | null) => number,
  xPoint: (i: number) => number,
  yFor: (v: number) => number,
) {
  const n = labels.length;
  if (n === 0) return '';
  const top = labels.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xPoint(i)} ${yFor(base[i] + at(s.values[i]))}`);
  const bottom = labels
    .map((_, i) => `L ${xPoint(i)} ${yFor(base[i])}`)
    .reverse();
  return `${top.join(' ')} ${bottom.join(' ')} Z`;
}

/** 1/2/5×10^k tick ladder. `max <= 0` (empty data, all-zero) still returns a usable [0,1] axis. */
export function niceTicks(max: number, targetCount = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rawStep = max / targetCount;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const niceMax = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= niceMax + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

function fmtTick(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
