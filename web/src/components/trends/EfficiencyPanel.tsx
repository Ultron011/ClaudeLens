import { useMemo } from 'react';
import { getEfficiency, type Efficiency, type ModelPeriod } from '../../api.trends.js';
import { fmtCost, fmtDay, fmtTokens } from '../../format.js';
import { foldModels } from '../../charts/palette.js';
import { useFetch } from '../../useFetch.js';
import { usePref } from '../../usePref.js';
import { ViewToggle } from '../ViewToggle.js';
import { TrendLines, type LineSeries } from './TrendLines.js';
import '../../styles.trends.css';

type Metric = 'costPerMessage' | 'cacheHitRate' | 'tokensPerMessage';

function ratios(c: ModelPeriod | null): Record<Metric, number | null> {
  if (!c) return { costPerMessage: null, cacheHitRate: null, tokensPerMessage: null };
  const denom = (c.inputTokens ?? 0) + (c.cacheReadTokens ?? 0) + (c.cacheCreationTokens ?? 0);
  return {
    costPerMessage: c.messages > 0 ? c.cost / c.messages : null,
    tokensPerMessage: c.messages > 0 ? c.tokens / c.messages : null,
    cacheHitRate: c.cacheReadTokens != null && denom > 0 ? c.cacheReadTokens / denom : null,
  };
}

function sumPeriods(parts: Array<ModelPeriod | null>): ModelPeriod | null {
  const real = parts.filter((p): p is ModelPeriod => !!p);
  if (!real.length) return null;
  const breakdown = real.every((p) => p.inputTokens != null);
  return {
    messages: real.reduce((n, p) => n + p.messages, 0),
    cost: real.reduce((n, p) => n + p.cost, 0),
    tokens: real.reduce((n, p) => n + p.tokens, 0),
    inputTokens: breakdown ? real.reduce((n, p) => n + (p.inputTokens ?? 0), 0) : null,
    cacheReadTokens: breakdown ? real.reduce((n, p) => n + (p.cacheReadTokens ?? 0), 0) : null,
    cacheCreationTokens: breakdown ? real.reduce((n, p) => n + (p.cacheCreationTokens ?? 0), 0) : null,
  };
}

const fmtPerMsg = (v: number) =>
  v === 0 ? '$0' : v >= 10 ? `$${Math.round(v)}` : v >= 1 ? `$${v.toFixed(2).replace(/\.00$/, '')}` : fmtCost(v);
const fmtRate = (v: number) => {
  const p = v * 100;
  return `${Math.abs(p - Math.round(p)) < 1e-9 ? Math.round(p) : p.toFixed(1)}%`;
};

/** Cost & efficiency over time: cost per human message, cache hit rate and tokens per message,
 *  overall or split by model (foldModels colours, so a model keeps its hue across pages). Daily
 *  buckets for ranges ≤ 31 days, else weekly; sessions are attributed to the period they started.
 *
 *  Pre-plugin-0.7 rows carry ~5× inflated costs (and double-counted split messages) until they
 *  re-sync, so there's a visible "only re-synced sessions" toggle instead of silently mixing. */
export function EfficiencyPanel({
  identity,
  from,
  to,
}: {
  identity?: string;
  from: Date;
  to: Date;
}) {
  const [split, setSplit] = usePref('effsplit', 'all');
  const [resyncedPref, setResynced] = usePref('resynced', 'false');
  const resynced = resyncedPref === 'true';
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const { data, err, refetch } = useFetch<Efficiency>(
    (signal) => getEfficiency({ identity, from: fromIso, to: toIso, resynced }, signal),
    [identity, fromIso, toIso, resynced],
  );

  const built = useMemo(() => {
    if (!data) return null;
    const labels = data.points.map((p) => fmtDay(p.period));
    const metrics: Metric[] = ['costPerMessage', 'cacheHitRate', 'tokensPerMessage'];
    const out = {} as Record<Metric, LineSeries[]>;
    if (split !== 'model') {
      for (const m of metrics)
        out[m] = [{ key: 'all', label: 'All models', color: 'var(--viz-primary)', values: data.points.map((p) => p[m]) }];
      return { labels, series: out };
    }
    const { rows, other } = foldModels(data.models);
    const slotted = new Set(rows.map((r) => r.model));
    const n = data.points.length;
    const groups: Array<{ key: string; label: string; color: string; parts: Array<ModelPeriod | null> }> = rows.map((r) => ({
      key: r.model,
      label: r.model,
      color: r.color,
      parts: data.byModel[r.model] ?? new Array(n).fill(null),
    }));
    if (other) {
      const rest = Object.keys(data.byModel).filter((m) => !slotted.has(m));
      groups.push({
        key: 'Other',
        label: 'Other',
        color: other.color,
        parts: Array.from({ length: n }, (_, i) => sumPeriods(rest.map((m) => data.byModel[m]?.[i] ?? null))),
      });
    }
    for (const m of metrics) {
      out[m] = groups
        .map((g) => ({ key: g.key, label: g.label, color: g.color, values: g.parts.map((p) => ratios(p)[m]) }))
        .filter((s) => s.values.some((v) => v != null));
    }
    return { labels, series: out };
  }, [data, split]);

  const cov = data?.coverage;
  const unit = data?.bucket === 'week' ? 'week (Mon–Sun, UTC)' : 'UTC day';

  return (
    <section className="panel col-12">
      <div className="panel-head">
        <div>
          <h4>Cost &amp; efficiency</h4>
          <p className="panel-sub">
            Per {unit}, by the day each session started. Messages are human-typed only; per-model
            lines split a session’s messages by that model’s share of turns.
          </p>
        </div>
        <div className="controls" style={{ margin: 0 }}>
          <button
            type="button"
            className={resynced ? 'chip on' : 'chip'}
            aria-pressed={resynced}
            onClick={() => setResynced(resynced ? 'false' : 'true')}
            title="Sessions synced by plugin 0.7+ (parser v7). Older rows overstate cost roughly 5× until they re-sync."
          >
            Only re-synced sessions
          </button>
          <ViewToggle
            label="Split"
            value={split === 'model' ? 'model' : 'all'}
            onChange={setSplit}
            options={[
              { value: 'all', label: 'All models' },
              { value: 'model', label: 'By model' },
            ]}
          />
        </div>
      </div>

      {cov && (
        <p className="trend-note" role="note">
          {resynced
            ? `Showing ${cov.sessions.toLocaleString()} re-synced ${cov.sessions === 1 ? 'session' : 'sessions'} only.`
            : cov.resynced < cov.sessions
              ? `${(cov.sessions - cov.resynced).toLocaleString()} of ${cov.sessions.toLocaleString()} sessions predate plugin 0.7 — their cost is roughly 5× overstated until they re-sync.`
              : 'Every session in range is re-synced (parser v7+).'}
        </p>
      )}

      {err && !data ? (
        <div className="empty compact">
          <p className="muted">Couldn’t load efficiency trends: {err}</p>
          <button type="button" className="chip" onClick={refetch}>
            Retry
          </button>
        </div>
      ) : !built ? (
        <div className="eff-grid">
          <div className="skel skel-chart" />
          <div className="skel skel-chart" />
          <div className="skel skel-chart" />
        </div>
      ) : data!.points.every((p) => p.sessions === 0) ? (
        <p className="muted" style={{ padding: 'var(--s6) 0' }}>
          {resynced ? 'No re-synced sessions in this range yet.' : 'Nothing recorded in this range.'}
        </p>
      ) : (
        <div className="eff-grid">
          <div>
            <h5 className="eff-title">Cost per message</h5>
            <TrendLines
              labels={built.labels}
              series={built.series.costPerMessage}
              format={fmtPerMsg}
              legend={split === 'model'}
              ariaLabel={`Cost per human message per ${data!.bucket}`}
            />
          </div>
          <div>
            <h5 className="eff-title">Cache hit rate</h5>
            {built.series.cacheHitRate.length === 0 ? (
              <p className="muted eff-empty">
                Per-model cache breakdown needs sessions synced by parser v5+.
              </p>
            ) : (
              <TrendLines
                labels={built.labels}
                series={built.series.cacheHitRate}
                format={fmtRate}
                zero={false}
                legend={split === 'model'}
                ariaLabel={`Cache hit rate per ${data!.bucket}: cache reads over all input tokens`}
              />
            )}
            {split === 'model' && built.series.cacheHitRate.length > 0 && (
              <p className="trend-note">Per-model cache rates only exist for sessions synced by parser v5+.</p>
            )}
          </div>
          <div>
            <h5 className="eff-title">Tokens per message</h5>
            <TrendLines
              labels={built.labels}
              series={built.series.tokensPerMessage}
              format={(v) => fmtTokens(v)}
              legend={split === 'model'}
              ariaLabel={`Tokens per human message per ${data!.bucket}`}
            />
          </div>
        </div>
      )}
    </section>
  );
}
