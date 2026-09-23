import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getToolInsights, type McpServerRow, type ToolRow, type ToolsResponse } from '../api.insights.js';
import { fmtDate, fmtDay } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Kpi, KpiSkeleton } from '../components/Kpi.js';
import { DataTable, type Column } from '../components/DataTable.js';
import { Chart } from '../charts/Chart.js';
import { useFetch } from '../useFetch.js';
import {
  Bar,
  Coverage,
  ErrorState,
  InsightsTabs,
  ScopeFilters,
  pct,
  useInsightScope,
} from '../components/insights/InsightsChrome.js';
import '../styles.insights.css';

/** What each Claude Code `toolDenialKind` means, in the dashboard's words. */
const DENIAL_KINDS: Record<string, string> = {
  'automode-blocked': 'Auto mode’s safety check refused the call',
  'user-rejected': 'The person said no at the permission prompt',
  'permission-rule': 'A deny rule in settings blocked it',
};

/** A failure rate worth flagging. */
const HIGH = 0.1;

const rateCell = (r: number | null, tracked: number) =>
  r === null ? (
    <span className="muted" title="No sessions with failure data used this tool">
      —
    </span>
  ) : (
    <span className={r >= HIGH && tracked >= 5 ? 'fail-rate high' : 'fail-rate'} title={`over ${tracked} tracked calls`}>
      {(r * 100).toFixed(1)}%
    </span>
  );

export function ToolsPage() {
  const { person, project, setParam, scope, scopeKey, rangeLabel, rangePicker } = useInsightScope();
  const { data, err, loading } = useFetch<ToolsResponse>((signal) => getToolInsights(scope, signal), [scopeKey]);
  const [trendTool, setTrendTool] = useState('');
  const [server, setServer] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [hideMcp, setHideMcp] = useState(false);

  const first = loading && !data;
  const t = data?.totals;
  const cov = data?.coverage;

  // Trend: all tools, or one of the server-picked top tools.
  const weekly =
    trendTool && data
      ? data.weeklyByTool.filter((w) => w.tool === trendTool)
      : (data?.weekly ?? []);
  const labels = weekly.map((w) => fmtDay(w.week));

  let tools = data?.tools ?? [];
  if (server) tools = tools.filter((x) => x.server === server);
  else if (hideMcp) tools = tools.filter((x) => !x.server);
  const shown = showAll || server ? tools : tools.slice(0, 20);

  const maxUses = Math.max(1, ...tools.map((x) => x.uses));
  const toolCols: Column<ToolRow>[] = [
    {
      key: 'tool',
      header: 'Tool',
      sortable: true,
      sortValue: (r) => r.tool,
      render: (r) => (
        <span className="mono ins-tool" title={r.tool}>
          {r.server ? <span className="muted">{r.server} · </span> : null}
          {r.server ? r.tool.replace(/^mcp__.+?__/, '') : r.tool}
        </span>
      ),
    },
    {
      key: 'uses',
      header: 'Uses',
      numeric: true,
      sortable: true,
      sortValue: (r) => r.uses,
      render: (r) => (
        <span className="ins-num-bar">
          <Bar value={r.uses} max={maxUses} tone="muted" />
          {r.uses.toLocaleString()}
        </span>
      ),
    },
    { key: 'sessions', header: 'Sessions', numeric: true, sortable: true, sortValue: (r) => r.sessions, render: (r) => r.sessions.toLocaleString() },
    { key: 'errors', header: 'Failures', numeric: true, sortable: true, sortValue: (r) => r.errors, render: (r) => (r.errors ? r.errors.toLocaleString() : <span className="muted">0</span>) },
    {
      key: 'rate',
      header: 'Failure rate',
      numeric: true,
      sortable: true,
      sortValue: (r) => r.failureRate ?? -1,
      render: (r) => rateCell(r.failureRate, r.trackedUses),
    },
    {
      key: 'denials',
      header: 'Denials',
      numeric: true,
      sortable: true,
      sortValue: (r) => r.denials,
      render: (r) =>
        r.denials ? (
          <span title={Object.entries(r.denialKinds).map(([k, n]) => `${k}: ${n}`).join(' · ')}>{r.denials}</span>
        ) : (
          <span className="muted">0</span>
        ),
    },
  ];

  const serverCols: Column<McpServerRow>[] = [
    {
      key: 'server',
      header: 'Server',
      sortable: true,
      sortValue: (r) => r.server,
      render: (r) => (
        <button
          type="button"
          className={server === r.server ? 'link-btn ins-server on' : 'link-btn ins-server'}
          aria-pressed={server === r.server}
          onClick={() => {
            setServer(server === r.server ? '' : r.server);
            document.getElementById('ins-tools-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          title="Show this server’s tools below"
        >
          {r.server}
        </button>
      ),
    },
    { key: 'tools', header: 'Tools', numeric: true, sortable: true, sortValue: (r) => r.tools, render: (r) => r.tools },
    { key: 'uses', header: 'Uses', numeric: true, sortable: true, sortValue: (r) => r.uses, render: (r) => r.uses.toLocaleString() },
    { key: 'errors', header: 'Failures', numeric: true, sortable: true, sortValue: (r) => r.errors, render: (r) => r.errors || <span className="muted">0</span> },
    { key: 'rate', header: 'Failure rate', numeric: true, sortable: true, sortValue: (r) => r.failureRate ?? -1, render: (r) => rateCell(r.failureRate, r.trackedUses) },
    { key: 'denials', header: 'Denials', numeric: true, sortable: true, sortValue: (r) => r.denials, render: (r) => r.denials || <span className="muted">0</span> },
  ];

  const maxDenial = Math.max(1, ...(data?.denials ?? []).map((d) => d.count));

  return (
    <Shell crumbs={[{ label: 'Insights', to: '/insights/decisions' }, { label: 'Tools' }]} actions={rangePicker}>
      <div className="page-head">
        <div>
          <h1>Tool reliability</h1>
          <p className="lede">
            Which tools fail, which get blocked, and whether it’s getting better — over {rangeLabel}.
          </p>
        </div>
        <div className="page-head-actions">
          <InsightsTabs />
        </div>
      </div>

      <ScopeFilters person={person} project={project} setParam={setParam} />

      {err ? (
        <ErrorState title="Couldn’t load tool reliability" err={err} />
      ) : (
        <>
          <div className="kpi-row">
            {first || !t || !cov ? (
              <>
                <KpiSkeleton label="Tool calls" />
                <KpiSkeleton label="Failure rate" />
                <KpiSkeleton label="Denials" />
                <KpiSkeleton label="MCP servers" />
              </>
            ) : (
              <>
                <Kpi label="Tool calls" icon="bolt" value={t.uses.toLocaleString()} foot={`${(data?.tools.length ?? 0).toLocaleString()} distinct tools`} />
                <Kpi
                  label="Failure rate"
                  icon="cpu"
                  value={t.failureRate === null ? '—' : `${(t.failureRate * 100).toFixed(1)}%`}
                  foot={`${t.errors.toLocaleString()} of ${t.trackedUses.toLocaleString()} tracked calls`}
                  primary
                />
                <Kpi label="Denials" icon="eyeOff" value={t.denials.toLocaleString()} foot="blocked before running" />
                <Kpi
                  label="MCP servers"
                  icon="layers"
                  value={(data?.mcpServers.length ?? 0).toLocaleString()}
                  foot={`${(data?.mcpServers.reduce((n, s) => n + s.uses, 0) ?? 0).toLocaleString()} calls`}
                />
              </>
            )}
          </div>

          {cov && (
            <Coverage>
              Failures and denials are based on {cov.tracked.toLocaleString()} of{' '}
              {cov.sessions.toLocaleString()} sessions in this range — the ones synced with parser v7+
              (plugin ≥0.7){cov.trackedSince ? `, from ${fmtDate(cov.trackedSince)}` : ''}. Rates divide
              by those sessions’ calls only; “Uses” counts every session.
            </Coverage>
          )}

          <div className="bento">
            <section className="panel col-8">
              <div className="panel-head">
                <div>
                  <h4>Failure rate by week</h4>
                  <p className="panel-sub">
                    Failed calls ÷ calls, per UTC week (Mon), tracked sessions only.
                  </p>
                </div>
                {data && data.trendTools.length > 0 && (
                  <label className="filter">
                    <span className="sr-only">Tool</span>
                    <select value={trendTool} onChange={(e) => setTrendTool(e.target.value)}>
                      <option value="">All tools</option>
                      {data.trendTools.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {first ? (
                <div className="skel skel-chart" />
              ) : weekly.length === 0 ? (
                <p className="muted ins-empty-chart">No sessions with failure data in this range.</p>
              ) : (
                <>
                  <Chart
                    kind="line"
                    height={200}
                    labels={labels}
                    series={[
                      {
                        key: 'rate',
                        label: 'Failure rate %',
                        color: 'var(--series-2)',
                        values: weekly.map((w) => (w.failureRate === null ? null : Math.round(w.failureRate * 1000) / 10)),
                      },
                    ]}
                    ariaLabel={`Weekly failure rate in percent, ${trendTool || 'all tools'}, ${labels.length} weeks`}
                  />
                  <p className="panel-sub ins-chart-foot">
                    Weeks with few calls swing hard — {weekly.map((w) => w.uses).reduce((a, b) => Math.min(a, b), Infinity).toLocaleString()} calls in the quietest.
                  </p>
                </>
              )}
            </section>

            <section className="panel col-4">
              <div className="panel-head">
                <div>
                  <h4>Denials by kind</h4>
                  <p className="panel-sub">Calls blocked before they ran.</p>
                </div>
              </div>
              {first ? (
                <div className="skel skel-chart" />
              ) : !data?.denials.length ? (
                <p className="muted">No denials recorded in this range.</p>
              ) : (
                <ul className="ins-bars">
                  {data.denials.map((d) => (
                    <li key={d.kind}>
                      <div className="ins-bars-row">
                        <span className="mono">{d.kind}</span>
                        <strong>{d.count}</strong>
                      </div>
                      <Bar value={d.count} max={maxDenial} tone="warn" />
                      <span className="ins-bars-sub">
                        {DENIAL_KINDS[d.kind] ?? 'Claude Code denial kind'} · {d.sessions}{' '}
                        {d.sessions === 1 ? 'session' : 'sessions'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {(data?.mcpServers.length ?? 0) > 0 && (
              <section className="panel col-12">
                <div className="panel-head">
                  <div>
                    <h4>MCP servers</h4>
                    <p className="panel-sub">
                      Tools named <code>mcp__&lt;server&gt;__&lt;tool&gt;</code>, rolled up per server. Pick one
                      to list its tools below.
                    </p>
                  </div>
                </div>
                <DataTable
                  columns={serverCols}
                  rows={data!.mcpServers}
                  rowKey={(r) => r.server}
                  caption="MCP servers by use, with failure rates"
                  ariaLabel="MCP servers"
                />
              </section>
            )}

            <section className="panel col-12" id="ins-tools-table">
              <div className="panel-head">
                <div>
                  <h4>{server ? `Tools on ${server}` : 'All tools'}</h4>
                  <p className="panel-sub">
                    Rates of {(HIGH * 100).toFixed(0)}% or more over at least 5 tracked calls are flagged.
                    Hover a denial count for its kinds.
                  </p>
                </div>
                <div className="ins-head-actions">
                  {server ? (
                    <button type="button" className="chip" onClick={() => setServer('')}>
                      Show all tools
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={hideMcp ? 'chip on' : 'chip'}
                      aria-pressed={hideMcp}
                      onClick={() => setHideMcp((v) => !v)}
                    >
                      Hide MCP tools
                    </button>
                  )}
                </div>
              </div>
              {first ? (
                <div className="skel" style={{ height: 260, borderRadius: 'var(--r-lg)' }} />
              ) : tools.length === 0 ? (
                <p className="muted">No tool calls in this range.</p>
              ) : (
                <>
                  <DataTable
                    columns={toolCols}
                    rows={shown}
                    rowKey={(r) => r.tool}
                    caption="Tool calls, failures and denials"
                    ariaLabel="Tools"
                  />
                  {!server && tools.length > shown.length && (
                    <div className="load-more">
                      <button type="button" className="chip" onClick={() => setShowAll(true)}>
                        Show all {tools.length} tools
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
          <p className="ins-footnote muted">
            Per-model tool mix lives on <Link to="/analytics/models">Models</Link>.
          </p>
        </>
      )}
    </Shell>
  );
}
