import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon.js';

/** Headline metric tile. One tile per band may set `primary` — the page's single most important
 *  number. The accent is a selection/importance signal, not decoration, so a band where every
 *  tile is accented is wrong. `foot` carries context (what the number is over, or its secondary
 *  reading) rather than a fabricated trend delta: nothing in the API supplies period-over-period
 *  change, and inventing one would be a claim the data can't back. */
export function Kpi({
  label,
  value,
  icon,
  foot,
  primary,
  title,
  small,
}: {
  label: string;
  value: string;
  icon?: IconName;
  foot?: ReactNode;
  primary?: boolean;
  title?: string;
  small?: boolean;
}) {
  return (
    <div className={primary ? 'kpi is-primary' : 'kpi'} title={title}>
      <div className="kpi-label">
        {icon && <Icon name={icon} size={13} />}
        {label}
      </div>
      <div className={small ? 'kpi-value sm' : 'kpi-value'}>{value}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

/** Loading twin of `Kpi` — same box, same rhythm, so content arrival doesn't reflow the band. */
export function KpiSkeleton({ label }: { label: string }) {
  return (
    <div className="kpi" aria-hidden>
      <div className="kpi-label">{label}</div>
      <div className="skel skel-kpi" />
    </div>
  );
}
