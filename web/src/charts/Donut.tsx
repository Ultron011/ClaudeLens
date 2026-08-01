/** Share-of-total ring + legend (ref-02's "Sales by product category").
 *
 * Hand-rolled inline SVG, like `Chart.tsx` — no chart library (docs/frontend.md's 4-dep budget).
 * Slice colors must arrive already assigned by `palette.ts`'s `foldModels()`, never by array
 * index, so a model keeps its color when the range filter changes.
 *
 * Arcs are drawn as stroked circle segments via stroke-dasharray rather than as filled <path>
 * wedges: one geometry, no arc-flag maths, and a single-slice 100% case that renders as a plain
 * ring instead of degenerating into a zero-length path. */

export interface Slice {
  key: string;
  label: string;
  color: string;
  value: number;
}

export function Donut({
  slices,
  size = 168,
  thickness = 18,
  ariaLabel,
  centerLabel,
  centerValue,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  ariaLabel: string;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = slices.reduce((n, s) => n + Math.max(0, s.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;
  const arcs = slices.map((s) => {
    const frac = total > 0 ? Math.max(0, s.value) / total : 0;
    const arc = { ...s, frac, dash: frac * c, offset };
    offset += frac * c;
    return arc;
  });

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
          {/* track — also the entire visual when there's no data, so the ring never vanishes */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--viz-grid)"
            strokeWidth={thickness}
          />
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {arcs.map((a) => (
              <circle
                key={a.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth={thickness}
                strokeDasharray={`${a.dash} ${c - a.dash}`}
                strokeDashoffset={-a.offset}
              >
                <title>{`${a.label}: ${pct(a.frac)}`}</title>
              </circle>
            ))}
          </g>
        </svg>
        {(centerValue || centerLabel) && (
          <div className="donut-center">
            {centerValue && <div className="donut-center-value">{centerValue}</div>}
            {centerLabel && <div className="donut-center-label">{centerLabel}</div>}
          </div>
        )}
      </div>
      <ul className="donut-legend">
        {arcs.map((a) => (
          <li key={a.key}>
            <span className="model-dot" style={{ background: a.color }} aria-hidden />
            <span className="donut-legend-label">{a.label}</span>
            <span className="donut-legend-value">{pct(a.frac)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const pct = (f: number) => `${(f * 100).toFixed(f >= 0.1 ? 0 : 1)}%`;
