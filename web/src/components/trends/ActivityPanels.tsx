import { getActivity, getCompare, viewerTimeZone, type Activity, type Compare, type TrendScope } from '../../api.trends.js';
import { useFetch } from '../../useFetch.js';
import { HourHeatmap, tzShort } from './HourHeatmap.js';
import { CalendarHeatmap } from './CalendarHeatmap.js';
import '../../styles.trends.css';

const TZ = viewerTimeZone();

/** One /api/trends/activity fetch shared by the heatmap, the calendar and (on UserPage) the
 *  profile card's "active hours" line. */
export function useActivity(scope: TrendScope) {
  return useFetch<Activity>(
    (signal) => getActivity({ ...scope, tz: TZ }, signal),
    [scope.identity, scope.author, scope.project, scope.from, scope.to],
  );
}

/** This period vs the previous one of equal length, for KPI delta badges. */
export function useCompare(scope: TrendScope) {
  return useFetch<Compare>(
    (signal) => getCompare(scope, signal),
    [scope.identity, scope.author, scope.project, scope.from, scope.to],
  );
}

function PanelError({ err, onRetry }: { err: string; onRetry: () => void }) {
  return (
    <div className="empty compact">
      <p className="muted">Couldn’t load this panel: {err}</p>
      <button type="button" className="chip" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function HourHeatmapPanel({
  state,
  className = 'panel',
  who,
}: {
  state: ReturnType<typeof useActivity>;
  className?: string;
  who?: string;
}) {
  const { data, err, refetch } = state;
  return (
    <section className={className}>
      <div className="panel-head">
        <div>
          <h4>When {who ?? 'the team'} prompts</h4>
          <p className="panel-sub">
            Prompts typed, by weekday and hour in your timezone ({tzShort(data?.tz ?? TZ)}), for
            sessions in the selected range.
          </p>
        </div>
      </div>
      {err && !data ? (
        <PanelError err={err} onRetry={refetch} />
      ) : !data ? (
        <div className="skel skel-heat" />
      ) : (
        <HourHeatmap hours={data.hours} tz={data.tz} />
      )}
    </section>
  );
}

export function CalendarPanel({
  state,
  className = 'panel',
}: {
  state: ReturnType<typeof useActivity>;
  className?: string;
}) {
  const { data, err, refetch } = state;
  return (
    <section className={className}>
      <div className="panel-head">
        <div>
          <h4>Daily activity</h4>
          <p className="panel-sub">Messages per UTC day, last 26 weeks.</p>
        </div>
      </div>
      {err && !data ? (
        <PanelError err={err} onRetry={refetch} />
      ) : !data ? (
        <div className="skel skel-heat" />
      ) : (
        <CalendarHeatmap from={data.calendar.from} to={data.calendar.to} days={data.calendar.days} />
      )}
    </section>
  );
}
