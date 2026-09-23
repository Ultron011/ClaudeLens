import { Icon } from '../Icon.js';
import '../../styles.trends.css';

/** "This period vs the previous period of equal length" — ↑/↓ with a percentage.
 *
 * Colouring is **neutral by default**: more sessions, messages or spend is not good or bad on
 * its own (the product is about learning, not cost policing), so an arrow in muted ink is the
 * honest encoding. Pass `tone="up-good"` / `"down-good"` only for a metric that is clearly
 * directional; that switches to the success/warning tokens, and the arrow + words still carry
 * the meaning so it's never colour alone. */
export function DeltaBadge({
  current,
  previous,
  label = 'vs previous period',
  tone = 'neutral',
}: {
  current: number;
  previous: number;
  label?: string;
  tone?: 'neutral' | 'up-good' | 'down-good';
}) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0 && current === 0) {
    return (
      <span className="delta" data-dir="flat" aria-label={`No change ${label}`} title={`No activity in either period`}>
        — <span className="delta-label">{label}</span>
      </span>
    );
  }
  if (previous === 0) {
    return (
      <span className="delta" data-dir="up" aria-label={`New activity ${label} (none before)`} title="Nothing in the previous period">
        <Icon name="arrowUp" size={11} /> new <span className="delta-label">{label}</span>
      </span>
    );
  }
  const pct = ((current - previous) / previous) * 100;
  const dir = Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down';
  const shown = Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)).toString() : Math.abs(pct).toFixed(1);
  const mood =
    tone === 'neutral' || dir === 'flat'
      ? 'neutral'
      : (tone === 'up-good') === (dir === 'up')
        ? 'good'
        : 'bad';
  const words = dir === 'flat' ? 'About the same' : `${dir === 'up' ? 'Up' : 'Down'} ${shown}%`;
  return (
    <span
      className="delta"
      data-dir={dir}
      data-mood={mood}
      aria-label={`${words} ${label}`}
      title={`${words} ${label} (was ${previous.toLocaleString(undefined, { maximumFractionDigits: 2 })})`}
    >
      {dir !== 'flat' && <Icon name={dir === 'up' ? 'arrowUp' : 'arrowDown'} size={11} />}
      {dir === 'flat' ? '≈' : `${shown}%`}
      <span className="delta-label">{label}</span>
    </span>
  );
}

/** "vs prev. 30d" — short enough for a KPI foot on a phone. */
export function periodLabel(from: Date, to: Date): string {
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  return `vs prev. ${days}d`;
}
