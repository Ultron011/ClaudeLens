import { fmtDay } from '../../format.js';
import '../../styles.trends.css';

/** Tiny inline-SVG trend line for a table cell or card. Fixed pixel box (no measuring — it's
 *  always small), 1.5px line over a faint area, a dot on the last value. Zero-based so a flat-
 *  lined person and a busy one aren't drawn identically. Not interactive: the `<title>` tooltip and
 *  aria-label carry the numbers (total, peak day, last day). */
export function Sparkline({
  values,
  days,
  width = 96,
  height = 24,
  label,
  color = 'var(--viz-primary)',
}: {
  values: number[];
  /** UTC day keys aligned with `values`, for the tooltip's peak/last dates */
  days?: string[];
  width?: number;
  height?: number;
  /** what's being counted, e.g. "Messages" */
  label: string;
  color?: string;
}) {
  const n = values.length;
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...values);
  const peakI = values.indexOf(max);
  const summary =
    n === 0 || total === 0
      ? `${label}: none in this period`
      : `${label}: ${fmtNum(total)} over ${n} days, peak ${fmtNum(max)}${days?.[peakI] ? ` on ${fmtDay(days[peakI])}` : ''}, last day ${fmtNum(values[n - 1])}`;

  if (n === 0 || total === 0) {
    return (
      <svg className="spark" width={width} height={height} role="img" aria-label={summary}>
        <title>{summary}</title>
        <line x1={1} x2={width - 1} y1={height - 2} y2={height - 2} stroke="var(--viz-axis)" strokeWidth={1} strokeDasharray="2 3" />
      </svg>
    );
  }
  const pad = 2;
  const x = (i: number) => pad + (n === 1 ? (width - 2 * pad) / 2 : (i * (width - 2 * pad)) / (n - 1));
  const y = (v: number) => height - pad - (max > 0 ? (v / max) * (height - 2 * pad) : 0);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)} ${height - pad} L${x(0).toFixed(1)} ${height - pad} Z`;
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary}>
      <title>{summary}</title>
      <path d={area} fill={color} fillOpacity={0.14} stroke="none" />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(values[n - 1])} r={2} fill={color} />
    </svg>
  );
}

const fmtNum = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 }));
