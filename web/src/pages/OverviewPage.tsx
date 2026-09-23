import { Link } from 'react-router-dom';
import { getAnalytics, type Analytics, type AuthorSummary } from '../api.js';
import { fmtCost, fmtDay, fmtTokens } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Stat } from '../components/Stat.js';
import { Kpi, KpiSkeleton } from '../components/Kpi.js';
import { Icon } from '../components/Icon.js';
import { ViewToggle } from '../components/ViewToggle.js';
import { DateRangePicker } from '../components/DateRangePicker.js';
import { DataTable, type Column } from '../components/DataTable.js';
import { useOrgStats } from '../components/AppLayout.js';
import { useFetch } from '../useFetch.js';
import { useDateRange, useLayoutPref } from '../usePref.js';
import { Chart } from '../charts/Chart.js';
import { Donut } from '../charts/Donut.js';
import { foldModels } from '../charts/palette.js';
import { getSparklines, type Sparklines } from '../api.trends.js';
import { DeltaBadge, periodLabel } from '../components/trends/DeltaBadge.js';
import { Sparkline } from '../components/trends/Sparkline.js';
import { CalendarPanel, HourHeatmapPanel, useActivity, useCompare } from '../components/trends/ActivityPanels.js';

export function OverviewPage() {
  // Org stats come from the layout route — mounted once, shared with the rail.
  const { stats, err } = useOrgStats();
  const [layout, setLayout] = useLayoutPref();
  const { range, from, to, customFrom, customTo, apply } = useDateRange();

  const { data: series, err: seriesErr, refetch: refetchSeries } = useFetch<Analytics>(
    (signal) => getAnalytics(undefined, from.toISOString(), to.toISOString(), signal),
    [range, customFrom, customTo],
  );

  const daily = series?.daily ?? [];
  const { rows: modelRows, other } = foldModels(series?.models ?? []);
  const slices = (other ? [...modelRows, other] : modelRows).map((m) => ({
    key: m.model,
    label: m.model,
    color: m.color,
    value: Number(m.tokens),
  }));

  // KPIs follow the range picker like the charts beside them. They used to be all-time totals
  // under a range picker, which read as "this period".
  const tot = series?.totals;

  // Trends: period-over-period deltas, the team heatmaps, per-person sparklines (one request).
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const { data: cmp } = useCompare({ from: fromIso, to: toIso });
  const activity = useActivity({ from: fromIso, to: toIso });
  const { data: sparks } = useFetch<Sparklines>(
    (signal) => getSparklines({ by: 'author', from: fromIso, to: toIso }, signal),
    [fromIso, toIso],
  );
  const vs = periodLabel(from, to);
  const delta = (k: 'sessions' | 'userMessages' | 'cost' | 'people') =>
    cmp ? <DeltaBadge current={cmp.current[k]} previous={cmp.previous[k]} label={vs} /> : null;

  if (err) {
    return (
      <Shell tagline="Overview">
        <div className="empty">
          <Icon name="cpu" size={22} className="empty-icon" />
          <h3>Can’t reach the server</h3>
          <p className="muted">{err}</p>
        </div>
      </Shell>
    );
  }

  const rangePicker = (
    <DateRangePicker
      range={range}
      customFrom={customFrom}
      customTo={customTo}
      onApply={apply}
    />
  );

  return (
    <Shell tagline="Overview" actions={rangePicker}>
      <div className="page-head">
        <div>
          <h1>Team overview</h1>
          <p className="lede">
            Who is working with Claude Code, on what, and at what cost. Open a teammate to drill
            into their projects, then into any session’s full transcript.
          </p>
        </div>
      </div>

      <div className="kpi-row">
        {!stats || !tot ? (
          <>
            <KpiSkeleton label="Sessions" />
            <KpiSkeleton label="People" />
            <KpiSkeleton label="Messages" />
            <KpiSkeleton label="Cost" />
          </>
        ) : (
          <>
            <Kpi
              label="Sessions"
              icon="message"
              value={tot.sessions.toLocaleString()}
              foot={
                <>
                  {delta('sessions')}
                  <span className="kpi-foot-rest">{`${stats.totals.sessions.toLocaleString()} all time`}</span>
                </>
              }
              primary
            />
            <Kpi
              label="People"
              icon="people"
              value={String(stats.totals.authors)}
              foot={
                cmp ? (
                  <>
                    <span title="People with at least one session in the selected range">
                      {cmp.current.people} active
                    </span>{' '}
                    {delta('people')}
                    <span className="kpi-foot-rest">{`${stats.authors.reduce((n, a) => n + a.projects, 0)} projects all time`}</span>
                  </>
                ) : (
                  `all time · ${stats.authors.reduce((n, a) => n + a.projects, 0)} projects between them`
                )
              }
            />
            <Kpi
              label="Messages"
              icon="person"
              value={(tot.userMessages ?? 0).toLocaleString()}
              foot={
                <>
                  {delta('userMessages')}
                  <span className="kpi-foot-rest">{`${(tot.turns ?? 0).toLocaleString()} Claude turns`}</span>
                </>
              }
            />
            <Kpi
              label="Cost"
              icon="coin"
              value={fmtCost(tot.cost)}
              foot={
                <>
                  {delta('cost')}
                  <span className="kpi-foot-rest">{`${fmtTokens(tot.tokens ?? 0)} tokens · ${fmtCost(stats.totals.cost)} all time`}</span>
                </>
              }
            />
          </>
        )}
      </div>

      <div className="bento">
        <section className="panel col-8">
          <div className="panel-head">
            <div>
              <h4>Team activity</h4>
              <p className="panel-sub">Messages sent per UTC day.</p>
            </div>
          </div>
          {seriesErr && !series ? (
            <ChartError err={seriesErr} onRetry={refetchSeries} />
          ) : !series ? (
            <div className="skel skel-chart" />
          ) : (
            <Chart
              kind="bars"
              height={210}
              labels={daily.map((d) => fmtDay(d.day))}
              series={[
                {
                  key: 'messages',
                  label: 'Messages',
                  color: 'var(--viz-primary)',
                  values: daily.map((d) => Number(d.userMessages)),
                },
              ]}
              ariaLabel={`Messages per day, ${Math.round((to.getTime() - from.getTime()) / 86_400_000)} days`}
            />
          )}
        </section>

        <section className="panel col-4">
          <div className="panel-head">
            <div>
              <h4>Model mix</h4>
              <p className="panel-sub">
                Share of tokens,{' '}
                {range === 'custom' && customFrom && customTo
                  ? `${fmtDay(customFrom)} – ${fmtDay(customTo)}`
                  : `last ${Math.round((to.getTime() - from.getTime()) / 86_400_000)} days`}
                .
              </p>
            </div>
          </div>
          {seriesErr && !series ? (
            <ChartError err={seriesErr} onRetry={refetchSeries} />
          ) : !series ? (
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

        <HourHeatmapPanel state={activity} className="panel col-7" />
        <CalendarPanel state={activity} className="panel col-5" />

        {/* People is not wrapped in a .panel: the table (and the card grid) already carries its
         * own bordered surface, and a bordered surface inside a bordered surface is a nested
         * card. The heading row sits above it instead. */}
        <section className="col-8">
          <div className="panel-head">
            <div>
              <h4>People</h4>
              <p className="panel-sub">Sorted by sessions. Click through for their projects.</p>
            </div>
            <ViewToggle
              label="Layout"
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'table', label: 'Table' },
                { value: 'cards', label: 'Cards' },
              ]}
            />
          </div>
          {!stats ? (
            <div className="skel" style={{ height: 220, borderRadius: 'var(--r-lg)' }} />
          ) : stats.authors.length === 0 ? (
            <div className="empty">
              <Icon name="people" size={22} className="empty-icon" />
              <h3>No sessions yet</h3>
              <p>
                Install the plugin and connect it with <code>/claudelens:connect</code>. Every
                tracked session then syncs here on its own after each turn — nothing else to do.
              </p>
            </div>
          ) : layout === 'table' ? (
            <PeopleTable authors={stats.authors} sparks={sparks} />
          ) : (
            <div className="grid">
              {stats.authors.map((a) => (
                <PersonCard key={a.author} a={a} sparks={sparks} />
              ))}
            </div>
          )}
        </section>

        <div className="col-4 stack">
          <section className="panel">
            <div className="panel-head tight">
              <h4>Skills in use</h4>
            </div>
            {stats && stats.skills.length === 0 ? (
              <p className="muted">
                No skills used yet. Skills show up here the first time someone runs one.
              </p>
            ) : (
              <ul className="barlist">
                {(stats?.skills ?? []).slice(0, 10).map((s) => {
                  const maxSkill = Math.max(1, ...(stats?.skills ?? []).map((x) => x.uses));
                  return (
                    <li key={s.skill}>
                      <span className="bar-label">/{s.skill}</span>
                      <span className="bar-track">
                        <span className="bar-fill" style={{ width: `${(s.uses / maxSkill) * 100}%` }} />
                      </span>
                      <span className="bar-count">{s.uses}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-head tight">
              <h4>Top tools</h4>
            </div>
            <div className="toolcloud">
              {(stats?.tools ?? []).slice(0, 14).map((t) => (
                <span key={t.tool} className="pill">
                  {t.tool} <span className="tag-count">{t.uses}</span>
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function sparkFor(sparks: Sparklines | null, key: string): number[] {
  return sparks?.series.find((s) => s.key === key)?.values ?? (sparks ? sparks.days.map(() => 0) : []);
}

function PersonCard({ a, sparks }: { a: AuthorSummary; sparks: Sparklines | null }) {
  return (
    <article className="card">
      <Link className="card-link" aria-label={a.label} to={`/u/${encodeURIComponent(a.author)}`} />
      <div className="card-content">
        <div className="card-head">
          <div className="person">
            <span className="avatar" aria-hidden>
              {a.author.slice(0, 1).toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 className="card-title">{a.label}</h3>
              {a.identity !== a.author && <div className="card-meta">{a.identity}</div>}
            </div>
          </div>
          {a.featured > 0 && (
            <span className="star" title={`${a.featured} featured`}>
              <Icon name="star" filled />
            </span>
          )}
        </div>
        <div className="card-stats">
          <Stat label="projects" value={String(a.projects)} />
          <Stat label="sessions" value={String(a.sessions)} />
          <Stat
            label="messages"
            value={a.userMessages?.toLocaleString() ?? '—'}
            accent
            title={`${a.turns?.toLocaleString() ?? 0} Claude turns`}
          />
          <Stat label="cost" value={fmtCost(a.cost)} />
        </div>
        {sparks && (
          <div className="card-spark">
            <Sparkline values={sparkFor(sparks, a.author)} days={sparks.days} width={240} height={28} label="Messages per day" />
          </div>
        )}
      </div>
    </article>
  );
}

// No delete column here — `DELETE /api/authors` doesn't exist, so there'd be nothing for a
// per-row action to call.
function PeopleTable({ authors, sparks }: { authors: AuthorSummary[]; sparks: Sparklines | null }) {
  const columns: Column<AuthorSummary>[] = [
    {
      key: 'person',
      header: 'Person',
      sortable: true,
      sortValue: (a) => a.label,
      // Link by `author`: that's what /u/:author routes on. `label` is only for display.
      render: (a) => (
        <Link to={`/u/${encodeURIComponent(a.author)}`} className="person">
          <span className="avatar" style={{ width: 26, height: 26, fontSize: 11 }} aria-hidden>
            {a.author.slice(0, 1).toUpperCase()}
          </span>
          {a.label}
        </Link>
      ),
    },
    {
      key: 'account',
      header: 'Account',
      sortable: true,
      sortValue: (a) => a.identity,
      // identity is the account email when we have one, else it falls back to the author name —
      // in which case there's no account to show.
      render: (a) =>
        a.identity === a.author ? (
          <span className="muted">—</span>
        ) : (
          <span title={a.orgName ?? undefined}>{a.identity}</span>
        ),
    },
    {
      key: 'sessions',
      header: 'Sessions',
      numeric: true,
      sortable: true,
      sortValue: (a) => a.sessions,
      render: (a) => a.sessions,
    },
    {
      key: 'projects',
      header: 'Projects',
      numeric: true,
      sortable: true,
      sortValue: (a) => a.projects,
      render: (a) => a.projects,
    },
    {
      key: 'messages',
      header: 'Messages',
      numeric: true,
      sortable: true,
      sortValue: (a) => a.userMessages ?? 0,
      // The sparkline rides in the Messages cell (same measure, over the selected range) rather
      // than a column of its own — a 7th column starved the name column in the col-8 track.
      render: (a) => (
        <span className="num-spark">
          {sparks && (
            <Sparkline values={sparkFor(sparks, a.author)} days={sparks.days} width={48} height={18} label={`${a.label}: messages per day in range`} />
          )}
          <span title={`${a.turns?.toLocaleString() ?? 0} Claude turns (all time)`}>{a.userMessages?.toLocaleString() ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Cost',
      numeric: true,
      sortable: true,
      sortValue: (a) => (typeof a.cost === 'string' ? parseFloat(a.cost) : a.cost ?? 0),
      render: (a) => fmtCost(a.cost),
    },
  ];
  return (
    <DataTable columns={columns} rows={authors} rowKey={(a) => a.author} caption="People" ariaLabel="People" className="trend-table" />
  );
}

/** A failed chart fetch used to leave the skeleton shimmering forever. */
function ChartError({ err, onRetry }: { err: string; onRetry: () => void }) {
  return (
    <div className="empty compact">
      <p className="muted">Couldn’t load this chart: {err}</p>
      <button type="button" className="chip" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
