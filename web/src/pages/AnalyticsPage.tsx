import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SessionSummary } from '@claudelens/shared';
import { getAnalytics, type Analytics } from '../api.js';
import { fmtCost, fmtDateTime, fmtDay, fmtDuration, fmtTokens, msgCount } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Kpi, KpiSkeleton } from '../components/Kpi.js';
import { Icon } from '../components/Icon.js';
import { DateRangePicker } from '../components/DateRangePicker.js';
import { useFetch } from '../useFetch.js';
import { useDateRange, RANGE_PRESETS } from '../usePref.js';
import { Chart } from '../charts/Chart.js';
import { Donut } from '../charts/Donut.js';
import { foldModels, modelActiveMs, type ModelRow } from '../charts/palette.js';
import { DataTable, type Column } from '../components/DataTable.js';

export function AnalyticsPage() {
  const { author } = useParams();
  const identity = author ? decodeURIComponent(author) : undefined;
  const { range, from, to, customFrom, customTo, apply } = useDateRange();
  const days = RANGE_PRESETS[range];

  const { data, err, loading } = useFetch<Analytics>(
    (signal) => getAnalytics(identity, from.toISOString(), to.toISOString(), signal),
    [identity, range, customFrom, customTo],
  );

  const daily = data?.daily ?? [];
  const labels = daily.map((d) => fmtDay(d.day));
  const { rows, other } = foldModels(data?.models ?? []);
  const modelRows = other ? [...rows, other] : rows;
  const sessions = data?.sessions ?? [];
  const slices = modelRows.map((m) => ({
    key: m.model,
    label: m.model,
    color: m.color,
    value: Number(m.tokens),
  }));

  const rangeLabel =
    range === 'custom' && customFrom && customTo
      ? `${fmtDay(customFrom)} – ${fmtDay(customTo)}`
      : `the last ${days ?? 30} days`;

  const rangeToggle = (
    <DateRangePicker
      range={range}
      customFrom={customFrom}
      customTo={customTo}
      onApply={apply}
    />
  );

  return (
    <Shell
      crumbs={
        identity
          ? [{ label: identity, to: `/u/${encodeURIComponent(identity)}` }, { label: 'Analytics' }]
          : [{ label: 'Analytics' }]
      }
      actions={rangeToggle}
    >
      <div className="page-head">
        <div>
          <h1>{identity ? `${identity}’s analytics` : 'Analytics'}</h1>
          <p className="lede">
            Models, tokens, sessions and cost over {rangeLabel}. Days are UTC buckets computed at
            parse time, so a session spanning midnight is split across both days.
          </p>
        </div>
        {identity && (
          <div className="page-head-actions">
            <Link to={`/u/${encodeURIComponent(identity)}`} className="chip">
              <Icon name="person" size={13} />
              Their projects
            </Link>
          </div>
        )}
      </div>

      {err ? (
        <div className="empty">
          <Icon name="cpu" size={22} className="empty-icon" />
          <h3>Can’t reach the server</h3>
          <p className="muted">{err}</p>
        </div>
      ) : (
        <>
          <div className="kpi-row">
            {loading && !data ? (
              <>
                <KpiSkeleton label="Sessions" />
                <KpiSkeleton label="Messages" />
                <KpiSkeleton label="Tokens" />
                <KpiSkeleton label="Cost" />
              </>
            ) : (
              <>
                <Kpi
                  label="Sessions"
                  icon="message"
                  value={Number(data?.totals.sessions ?? 0).toLocaleString()}
                  foot={`in ${rangeLabel}`}
                  primary
                />
                <Kpi
                  label="Messages"
                  icon="person"
                  value={Number(data?.totals.userMessages ?? 0).toLocaleString()}
                  foot={`${Number(data?.totals.turns ?? 0).toLocaleString()} Claude turns back`}
                />
                <Kpi
                  label="Tokens"
                  icon="layers"
                  value={fmtTokens(Number(data?.totals.tokens ?? 0))}
                  foot="input + output + cache"
                />
                <Kpi
                  label="Cost"
                  icon="coin"
                  value={fmtCost(data?.totals.cost ?? 0)}
                  foot="from the transcript, not billing"
                />
              </>
            )}
          </div>

          <div className="bento">
            {/* Tokens leads at full width — it's the widest-dynamic-range series, so it earns the
             * resolution. The three supporting series pair off below it. */}
            <section className="panel col-12">
              <div className="panel-head">
                <div>
                  <h4>Tokens per day</h4>
                  <p className="panel-sub">Every token the team's turns consumed, cache included.</p>
                </div>
              </div>
              <ChartOrSkeleton loading={loading && !data} empty={daily.length === 0}>
                <Chart
                  kind="line"
                  height={230}
                  labels={labels}
                  series={[
                    {
                      key: 'tokens',
                      label: 'Tokens',
                      color: 'var(--viz-primary)',
                      values: daily.map((d) => Number(d.tokens)),
                    },
                  ]}
                  ariaLabel={`Tokens per day, ${labels.length} days`}
                />
              </ChartOrSkeleton>
            </section>

            <section className="panel col-6">
              <div className="panel-head">
                <div>
                  <h4>Sessions per day</h4>
                  <p className="panel-sub">
                    Counted on every UTC day a session was active — one spanning three days counts
                    three times.
                  </p>
                </div>
              </div>
              <ChartOrSkeleton loading={loading && !data} empty={daily.length === 0}>
                <Chart
                  kind="bars"
                  height={180}
                  labels={labels}
                  series={[
                    {
                      key: 'sessions',
                      label: 'Sessions',
                      color: 'var(--viz-primary)',
                      values: daily.map((d) => Number(d.sessions)),
                    },
                  ]}
                  ariaLabel={`Sessions per day, ${labels.length} days`}
                />
              </ChartOrSkeleton>
            </section>

            <section className="panel col-6">
              <div className="panel-head">
                <div>
                  <h4>Messages per day</h4>
                  <p className="panel-sub">Human messages only, not Claude's replies.</p>
                </div>
              </div>
              <ChartOrSkeleton loading={loading && !data} empty={daily.length === 0}>
                <Chart
                  kind="bars"
                  height={180}
                  labels={labels}
                  series={[
                    {
                      key: 'messages',
                      label: 'Messages',
                      color: 'var(--viz-primary)',
                      values: daily.map((d) => Number(d.userMessages)),
                    },
                  ]}
                  ariaLabel={`Messages per day, ${labels.length} days`}
                />
              </ChartOrSkeleton>
            </section>

            <section className="panel col-7">
              <div className="panel-head">
                <div>
                  <h4>Cost per day</h4>
                  <p className="panel-sub">US dollars, derived from the transcript's token counts.</p>
                </div>
              </div>
              <ChartOrSkeleton loading={loading && !data} empty={daily.length === 0}>
                <Chart
                  kind="bars"
                  height={180}
                  labels={labels}
                  series={[
                    {
                      key: 'cost',
                      label: 'Cost',
                      color: 'var(--viz-primary)',
                      values: daily.map((d) => Number(d.cost ?? 0)),
                    },
                  ]}
                  ariaLabel={`Cost per day in dollars, ${labels.length} days`}
                />
              </ChartOrSkeleton>
            </section>

            <section className="panel col-5">
              <div className="panel-head">
                <div>
                  <h4>Model mix</h4>
                  <p className="panel-sub">Share of tokens by model.</p>
                </div>
              </div>
              {loading && !data ? (
                <div className="skel skel-chart" />
              ) : slices.length === 0 ? (
                <p className="muted">No model usage in this range.</p>
              ) : (
                <Donut
                  slices={slices}
                  size={150}
                  centerValue={fmtTokens(slices.reduce((n, s) => n + s.value, 0))}
                  centerLabel="tokens"
                  ariaLabel="Share of tokens by model"
                />
              )}
            </section>

            <section className="panel col-12">
              <div className="panel-head">
                <div>
                  <h4>Sessions</h4>
                  <p className="panel-sub">Most recent sessions in the selected range.</p>
                </div>
              </div>
              {loading && !data ? (
                <div className="skel" style={{ height: 220, borderRadius: 'var(--r-lg)' }} />
              ) : sessions.length === 0 ? (
                <p className="muted">No sessions in this range.</p>
              ) : (
                <AnalyticsSessionsTable sessions={sessions} />
              )}
            </section>

            <section className="panel col-12">
              <div className="panel-head">
                <div>
                  <h4>Models</h4>
                  <p className="panel-sub">
                    Active time is measured where the transcript records it, else estimated from
                    response latency.
                  </p>
                </div>
              </div>
              {modelRows.length === 0 ? (
                <p className="muted">No model usage in this range.</p>
              ) : (
                <div className="chart-table-wrap" tabIndex={0} role="region" aria-label="Models table">
                  <table className="chart-table">
                    <caption className="sr-only">Per-model breakdown for the selected range</caption>
                    <thead>
                      <tr>
                        <th scope="col">Model</th>
                        <th scope="col" className="num">Sessions</th>
                        <th scope="col" className="num">Turns</th>
                        <th scope="col" className="num">Active time</th>
                        <th scope="col" className="num">Tokens</th>
                        <th scope="col" className="num">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelRows.map((m) => (
                        <ModelTableRow key={m.model} m={m} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}

/** Keeps the chart slot the same height whether it's loading, empty, or drawn — so the bento
 *  never reflows as the four panels resolve. */
function AnalyticsSessionsTable({ sessions }: { sessions: SessionSummary[] }) {
  const columns: Column<SessionSummary>[] = [
    { key: 'person', header: 'Person', sortable: true, sortValue: (s) => s.author, render: (s) => (
      <Link to={`/u/${encodeURIComponent(s.author)}`} className="person">
        <span className="avatar" style={{ width: 26, height: 26, fontSize: 11 }} aria-hidden>{s.author.slice(0, 1).toUpperCase()}</span>
        {s.displayName ?? s.author}
      </Link>
    ) },
    { key: 'account', header: 'Account', sortable: true, sortValue: (s) => s.accountEmail ?? s.orgName ?? '', render: (s) =>
      s.accountEmail || s.orgName ? <span title={s.orgName ?? undefined}>{s.accountEmail ?? s.orgName}</span> : <span className="muted">—</span> },
    { key: 'title', header: 'Session title', sortable: true, sortValue: (s) => s.title, render: (s) => <Link to={`/session/${s.id}`}>{s.title}</Link> },
    { key: 'directory', header: 'Directory', sortable: true, sortValue: (s) => s.cwd ?? s.project ?? '', render: (s) => <span className="mono" title={s.cwd ?? s.project}>{s.cwd ?? s.project ?? '—'}</span> },
    { key: 'messages', header: 'Messages', numeric: true, sortable: true, sortValue: (s) => msgCount(s.stats), render: (s) => msgCount(s.stats) },
    { key: 'model', header: 'Model used', sortable: true, sortValue: (s) => s.stats.models.join(', '), render: (s) => s.stats.models.join(', ') || Object.keys(s.stats.modelUsage).join(', ') || '—' },
    { key: 'cost', header: 'Cost', numeric: true, sortable: true, sortValue: (s) => s.stats.estimatedCostUsd ?? 0, render: (s) => fmtCost(s.stats.estimatedCostUsd) },
    { key: 'created', header: 'Created', sortable: true, sortValue: (s) => s.createdAt, render: (s) => fmtDateTime(s.createdAt) },
    { key: 'duration', header: 'Duration', numeric: true, sortable: true, sortValue: (s) => s.stats.durationMs ?? 0, render: (s) => fmtDuration(s.stats.durationMs) || '—' },
  ];
  return <DataTable columns={columns} rows={sessions} rowKey={(s) => s.id} caption="Sessions in the selected analytics range" ariaLabel="Sessions in the selected analytics range" />;
}

function ChartOrSkeleton({
  loading,
  empty,
  children,
}: {
  loading: boolean;
  empty: boolean;
  children: ReactNode;
}) {
  if (loading) return <div className="skel skel-chart" />;
  if (empty)
    return (
      <p className="muted" style={{ padding: 'var(--s6) 0' }}>
        Nothing recorded in this range. Try a longer window.
      </p>
    );
  return <>{children}</>;
}

function ModelTableRow({ m }: { m: ModelRow }) {
  return (
    <tr>
      <td>
        <span className="model-dot" style={{ background: m.color }} aria-hidden />
        {m.model}
      </td>
      <td className="num">{m.sessions}</td>
      <td className="num">{m.turns}</td>
      <td className="num" title={m.measured ? 'measured active time' : 'estimated from response latency'}>
        {fmtDuration(modelActiveMs(m)) || '—'}
      </td>
      <td className="num">{fmtTokens(Number(m.tokens))}</td>
      <td className="num">{fmtCost(m.cost)}</td>
    </tr>
  );
}
