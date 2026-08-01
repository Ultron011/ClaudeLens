/** Shared card-stat tile, used inside `.card-stats`. `title` is an optional tooltip — e.g. the
 *  Claude-side turn count as secondary context on the messages stat. */
export function Stat({
  label,
  value,
  accent,
  title,
}: {
  label: string;
  value: string;
  accent?: boolean;
  title?: string;
}) {
  return (
    <div className="stat" title={title}>
      <div className={accent ? 'stat-value accent' : 'stat-value'}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** Shared detail-page metric tile, used inside `.session-stats`. */
export function Metric({
  label,
  value,
  accent,
  title,
}: {
  label: string;
  value: string;
  accent?: boolean;
  title?: string;
}) {
  return (
    <div className="metric" title={title}>
      <div className={accent ? 'metric-value accent' : 'metric-value'}>{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}
