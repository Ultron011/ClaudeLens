import { Link, useParams } from 'react-router-dom';
import { getModelAnalytics, type ModelDetail, type ModelAnalytics, type AuthorModelRow } from '../api.js';
import { fmtCost, fmtDay, fmtDuration, fmtTokens } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Kpi, KpiSkeleton } from '../components/Kpi.js';
import { Icon } from '../components/Icon.js';
import { DateRangePicker } from '../components/DateRangePicker.js';
import { useFetch } from '../useFetch.js';
import { useDateRange, RANGE_PRESETS } from '../usePref.js';
import { foldModels, modelActiveMs } from '../charts/palette.js';

// ---------------------------------------------------------------------------
// Token composition bar (inline CSS stacked bar)
// ---------------------------------------------------------------------------

function TokenBar({ m }: { m: ModelDetail }) {
  const total = Number(m.tokens);
  if (!total) return <span className="muted">—</span>;
  const inp = Number(m.inputTokens);
  const cr = Number(m.cacheReadTokens);
  const cw = Number(m.cacheCreationTokens);
  const out = Number(m.outputTokens);
  // For old sessions without the breakdown, fall back to showing total only.
  const hasBreakdown = inp + cr + cw + out > 0;
  if (!hasBreakdown) {
    return (
      <div className="tok-bar-wrap" title="Breakdown unavailable — session synced before parser v5">
        <div className="tok-bar">
          <div className="tok-seg tok-seg--other" style={{ width: '100%' }} />
        </div>
        <span className="tok-bar-label muted">{fmtTokens(total)}</span>
      </div>
    );
  }
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return (
    <div
      className="tok-bar-wrap"
      title={`Input: ${fmtTokens(inp)} · Cache read: ${fmtTokens(cr)} · Cache write: ${fmtTokens(cw)} · Output: ${fmtTokens(out)}`}
    >
      <div className="tok-bar">
        {inp > 0 && <div className="tok-seg tok-seg--input" style={{ width: pct(inp) }} />}
        {cr > 0 && <div className="tok-seg tok-seg--cache-read" style={{ width: pct(cr) }} />}
        {cw > 0 && <div className="tok-seg tok-seg--cache-write" style={{ width: pct(cw) }} />}
        {out > 0 && <div className="tok-seg tok-seg--output" style={{ width: pct(out) }} />}
      </div>
      <span className="tok-bar-label">{fmtTokens(total)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cache efficiency badge
// ---------------------------------------------------------------------------

function cacheRate(m: ModelDetail): string | null {
  const inp = Number(m.inputTokens);
  const cr = Number(m.cacheReadTokens);
  const totalInput = inp + cr;
  if (!totalInput) return null;
  return `${((cr / totalInput) * 100).toFixed(0)}%`;
}

// ---------------------------------------------------------------------------
// Model comparison table
// ---------------------------------------------------------------------------

function ModelTable({ models, totalCost }: { models: ModelDetail[]; totalCost: number }) {
  const { rows, other } = foldModels(
    models.map((m) => ({
      model: m.model,
      sessions: m.sessions,
      turns: m.turns,
      activeMs: m.activeMs,
      tokens: m.tokens,
      cost: m.cost,
      measured: m.measured,
    })),
  );
  const colorMap = new Map([...rows, ...(other ? [other] : [])].map((r) => [r.model, r.color]));
  const displayModels = models.map((m) => ({
    ...m,
    color: colorMap.get(m.model) ?? 'var(--text-faint)',
  }));
  // Sort by cost desc (most expensive model first — most interesting for ROI)
  displayModels.sort((a, b) => Number(b.cost ?? 0) - Number(a.cost ?? 0));

  return (
    <div className="chart-table-wrap" tabIndex={0} role="region" aria-label="Model comparison table">
      <table className="chart-table">
        <caption className="sr-only">Per-model breakdown for the selected range</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col" className="num">Sessions</th>
            <th scope="col" className="num">Turns</th>
            <th scope="col" className="num">Active time</th>
            <th scope="col" className="num">Avg session</th>
            <th scope="col">Token composition</th>
            <th scope="col" className="num">Cache hit %</th>
            <th scope="col" className="num">Cost</th>
            <th scope="col" className="num">% of total</th>
          </tr>
        </thead>
        <tbody>
          {displayModels.map((m) => {
            const cost = Number(m.cost ?? 0);
            const pctCost = totalCost > 0 ? `${((cost / totalCost) * 100).toFixed(1)}%` : '—';
            const cr = cacheRate(m);
            return (
              <tr key={m.model}>
                <td>
                  <span className="model-dot" style={{ background: m.color }} aria-hidden />
                  {m.model}
                </td>
                <td className="num">{m.sessions.toLocaleString()}</td>
                <td className="num">{m.turns.toLocaleString()}</td>
                <td
                  className="num"
                  title={m.measured ? 'Measured active time' : 'Estimated from response latency'}
                >
                  {fmtDuration(modelActiveMs(m)) || '—'}
                  {!m.measured && <span className="muted" title="Estimated"> ~</span>}
                </td>
                <td className="num">
                  {m.avgSessionDurationMs ? fmtDuration(Number(m.avgSessionDurationMs)) : '—'}
                </td>
                <td style={{ minWidth: 180 }}>
                  <TokenBar m={m} />
                </td>
                <td className="num" title="Cache read tokens ÷ (input + cache read)">
                  {cr ?? '—'}
                </td>
                <td className="num">{fmtCost(m.cost)}</td>
                <td className="num">{pctCost}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team adoption matrix: authors × models
// ---------------------------------------------------------------------------

function TeamMatrix({ authorModels, models }: { authorModels: AuthorModelRow[]; models: ModelDetail[] }) {
  if (!authorModels.length) return <p className="muted">No data for this range.</p>;

  // Unique authors (in session-count order from the API)
  const authorSet = new Map<string, string>(); // identity → label
  for (const r of authorModels) authorSet.set(r.identity, r.label);

  // Model columns: use distinct model names from the matrix rows (covers all sessions, not just
  // those with modelUsage). Sort by total sessions in the matrix desc so the busiest column leads.
  const modelTotals = new Map<string, number>();
  for (const r of authorModels) modelTotals.set(r.model, (modelTotals.get(r.model) ?? 0) + r.sessions);
  const modelNames = [...modelTotals.keys()]
    .filter((m) => m !== '<synthetic>')
    .sort((a, b) => (modelTotals.get(b) ?? 0) - (modelTotals.get(a) ?? 0));

  // Build lookup: (identity, model) → sessions
  const lookup = new Map<string, number>();
  for (const r of authorModels) lookup.set(`${r.identity}|${r.model}`, r.sessions);

  // Max sessions for any cell — used to drive the heat shade
  const maxSessions = Math.max(...[...lookup.values()]);

  const authors = [...authorSet.entries()];

  return (
    <div className="chart-table-wrap" tabIndex={0} role="region" aria-label="Team model adoption matrix">
      <table className="chart-table">
        <caption className="sr-only">Sessions per author per model</caption>
        <thead>
          <tr>
            <th scope="col">Person</th>
            {modelNames.map((m) => (
              <th key={m} scope="col" className="num" title={m}>
                {m.length > 22 ? m.slice(0, 20) + '…' : m}
              </th>
            ))}
            <th scope="col" className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {authors.map(([identity, label]) => {
            const rowTotal = modelNames.reduce((s, m) => s + (lookup.get(`${identity}|${m}`) ?? 0), 0);
            return (
              <tr key={identity}>
                <td>
                  <Link to={`/analytics/models/u/${encodeURIComponent(identity)}`} className="subtle-link">
                    {label}
                  </Link>
                </td>
                {modelNames.map((model) => {
                  const n = lookup.get(`${identity}|${model}`);
                  const intensity = n && maxSessions ? n / maxSessions : 0;
                  return (
                    <td
                      key={model}
                      className="num"
                      style={n ? { background: `color-mix(in srgb, var(--accent) ${Math.round(intensity * 30 + 5)}%, transparent)` } : undefined}
                      title={n ? `${n} session${n === 1 ? '' : 's'}` : undefined}
                    >
                      {n ?? <span className="muted">—</span>}
                    </td>
                  );
                })}
                <td className="num" style={{ fontWeight: 600 }}>{rowTotal || <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permission modes panel
// ---------------------------------------------------------------------------

function PermissionModesPanel({ modes }: { modes: Array<{ mode: string; sessions: number }> }) {
  if (!modes.length) return <p className="muted">No mode data for this range.</p>;
  const total = modes.reduce((s, m) => s + m.sessions, 0);
  const modeLabel: Record<string, string> = {
    default: 'Default',
    acceptEdits: 'Accept Edits',
    bypassPermissions: 'Bypass Permissions',
    auto: 'Auto',
    dontAsk: "Don't Ask",
    plan: 'Plan',
  };
  return (
    <div className="mode-list">
      {modes.map((m) => {
        const pct = total > 0 ? (m.sessions / total) * 100 : 0;
        return (
          <div key={m.mode} className="mode-row">
            <span className="mode-name">{modeLabel[m.mode] ?? m.mode}</span>
            <div className="mode-bar-track">
              <div className="mode-bar-fill" style={{ width: `${pct.toFixed(1)}%` }} />
            </div>
            <span className="mode-count">{m.sessions.toLocaleString()}</span>
            <span className="muted mode-pct">{pct.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top tools panel
// ---------------------------------------------------------------------------

function TopToolsPanel({ tools }: { tools: Array<{ tool: string; uses: number }> }) {
  if (!tools.length) return <p className="muted">No tool usage in this range.</p>;
  const max = tools[0]?.uses ?? 1;
  return (
    <div className="mode-list">
      {tools.slice(0, 15).map((t) => (
        <div key={t.tool} className="mode-row">
          <span className="mode-name" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82em' }}>
            {t.tool}
          </span>
          <div className="mode-bar-track">
            <div className="mode-bar-fill" style={{ width: `${((t.uses / max) * 100).toFixed(1)}%` }} />
          </div>
          <span className="mode-count">{t.uses.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ModelAnalyticsPage() {
  const { author } = useParams();
  const identity = author ? decodeURIComponent(author) : undefined;
  const { range, from, to, customFrom, customTo, apply } = useDateRange();

  const { data, err, loading } = useFetch<ModelAnalytics>(
    (signal) => getModelAnalytics(identity, from.toISOString(), to.toISOString(), signal),
    [identity, range, customFrom, customTo],
  );

  const models = data?.models ?? [];
  const totalCost = models.reduce((s, m) => s + Number(m.cost ?? 0), 0);
  const rangeDesc =
    range === 'custom' && customFrom && customTo
      ? `${fmtDay(customFrom)} – ${fmtDay(customTo)}`
      : `the last ${RANGE_PRESETS[range] ?? 30} days`;

  const rangeToggle = (
    <DateRangePicker range={range} customFrom={customFrom} customTo={customTo} onApply={apply} />
  );

  return (
    <Shell
      crumbs={
        identity
          ? [
              { label: 'Analytics', to: '/analytics' },
              { label: identity, to: `/u/${encodeURIComponent(identity)}` },
              { label: 'Models' },
            ]
          : [{ label: 'Analytics', to: '/analytics' }, { label: 'Models' }]
      }
      actions={rangeToggle}
    >
      <div className="page-head">
        <div>
          <h1>{identity ? `${identity} — Model Analytics` : 'Model Analytics'}</h1>
          <p className="lede">
            Compare model performance, costs, and token composition over {rangeDesc}.{' '}
            {identity && (
              <>
                Viewing one person's usage.{' '}
                <Link to="/analytics/models">See team view →</Link>
              </>
            )}
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
          <h3>Can't reach the server</h3>
          <p className="muted">{err}</p>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="kpi-row">
            {loading && !data ? (
              <>
                <KpiSkeleton label="Models used" />
                <KpiSkeleton label="Sessions" />
                <KpiSkeleton label="Tokens" />
                <KpiSkeleton label="Cost" />
              </>
            ) : (
              <>
                <Kpi
                  label="Models used"
                  icon="cpu"
                  value={String(models.filter((m) => m.model !== '<synthetic>').length)}
                  foot={`in ${rangeDesc}`}
                  primary
                />
                <Kpi
                  label="Sessions"
                  icon="message"
                  value={Number(data?.totals.sessions ?? 0).toLocaleString()}
                  foot={`${Number(data?.totals.turns ?? 0).toLocaleString()} Claude turns`}
                />
                <Kpi
                  label="Tokens"
                  icon="layers"
                  value={fmtTokens(Number(data?.totals.tokens ?? 0))}
                  foot="input + cache + output"
                />
                <Kpi
                  label="Total cost"
                  icon="coin"
                  value={fmtCost(data?.totals.cost ?? 0)}
                  foot="from transcripts, not billing"
                />
              </>
            )}
          </div>

          {/* Model comparison table */}
          <div className="bento">
            <section className="panel col-12">
              <div className="panel-head">
                <div>
                  <h4>Model comparison</h4>
                  <p className="panel-sub">
                    Token composition shows input / cache-read / cache-write / output breakdown.
                    Cache hit % = cache-read ÷ (input + cache-read).
                    Active time is measured where the transcript records it, else estimated (~).
                  </p>
                </div>
              </div>
              {loading && !data ? (
                <div className="skel skel-chart" />
              ) : models.length === 0 ? (
                <p className="muted">No model usage in this range.</p>
              ) : (
                <>
                  <TokenLegend />
                  <ModelTable models={models} totalCost={totalCost} />
                </>
              )}
            </section>

            {/* Team matrix — only shown on the org-wide view */}
            {!identity && (
              <section className="panel col-12">
                <div className="panel-head">
                  <div>
                    <h4>Team adoption</h4>
                    <p className="panel-sub">
                      Sessions and cost per person per model. Click a name to see their individual
                      model breakdown.
                    </p>
                  </div>
                </div>
                {loading && !data ? (
                  <div className="skel skel-chart" />
                ) : (
                  <TeamMatrix authorModels={data?.authorModels ?? []} models={models} />
                )}
              </section>
            )}

            {/* Tools + Permission modes side by side */}
            <section className="panel col-6">
              <div className="panel-head">
                <div>
                  <h4>Top tools</h4>
                  <p className="panel-sub">
                    Most-used Claude Code tools across all sessions in this range.
                  </p>
                </div>
              </div>
              {loading && !data ? (
                <div className="skel skel-chart" />
              ) : (
                <TopToolsPanel tools={data?.tools ?? []} />
              )}
            </section>

            <section className="panel col-6">
              <div className="panel-head">
                <div>
                  <h4>Permission modes</h4>
                  <p className="panel-sub">
                    How sessions were run — each session can span multiple modes; counts overlap.
                  </p>
                </div>
              </div>
              {loading && !data ? (
                <div className="skel skel-chart" />
              ) : (
                <PermissionModesPanel modes={data?.permissionModes ?? []} />
              )}
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Token breakdown legend
// ---------------------------------------------------------------------------

function TokenLegend() {
  return (
    <div className="tok-legend">
      <span className="tok-legend-item">
        <span className="tok-dot tok-seg--input" />
        Input
      </span>
      <span className="tok-legend-item">
        <span className="tok-dot tok-seg--cache-read" />
        Cache read
      </span>
      <span className="tok-legend-item">
        <span className="tok-dot tok-seg--cache-write" />
        Cache write
      </span>
      <span className="tok-legend-item">
        <span className="tok-dot tok-seg--output" />
        Output
      </span>
    </div>
  );
}
