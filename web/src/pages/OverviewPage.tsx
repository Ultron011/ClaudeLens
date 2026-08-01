import { Link } from 'react-router-dom';
import { getAnalytics, type Analytics, type AuthorSummary } from '../api.js';
import { fmtCost, fmtDay, fmtTokens } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Stat } from '../components/Stat.js';
import { Kpi, KpiSkeleton } from '../components/Kpi.js';
import { Icon } from '../components/Icon.js';
import { ViewToggle } from '../components/ViewToggle.js';
import { DataTable, type Column } from '../components/DataTable.js';
import { useOrgStats } from '../components/AppLayout.js';
import { useFetch } from '../useFetch.js';
import { usePref } from '../usePref.js';
import { Chart } from '../charts/Chart.js';
import { Donut } from '../charts/Donut.js';
import { foldModels } from '../charts/palette.js';

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

export function OverviewPage() {
  // Org stats come from the layout route — mounted once, shared with the rail.
  const { stats, err } = useOrgStats();
  const [layoutRaw, setLayout] = usePref('layout', 'table');
  const layout = layoutRaw === 'cards' ? 'cards' : 'table';
  const [range, setRange] = usePref('range', '30d');
  const days = RANGE_DAYS[range] ?? 30;

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const { data: series } = useFetch<Analytics>(
    (signal) => getAnalytics(undefined, from.toISOString(), to.toISOString(), signal),
    [range],
  );

  const daily = series?.daily ?? [];
  const { rows: modelRows, other } = foldModels(series?.models ?? []);
  const slices = (other ? [...modelRows, other] : modelRows).map((m) => ({
    key: m.model,
    label: m.model,
    color: m.color,
    value: Number(m.tokens),
  }));

  const totalMessages = stats?.authors.reduce((n, a) => n + (a.userMessages ?? 0), 0) ?? 0;
  const totalTokens = stats?.authors.reduce((n, a) => n + Number(a.tokens ?? 0), 0) ?? 0;

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

  return (
    <Shell tagline="Overview">
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
        {!stats ? (
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
              value={stats.totals.sessions.toLocaleString()}
              foot="tracked across the team"
              primary
            />
            <Kpi
              label="People"
              icon="people"
              value={String(stats.totals.authors)}
              foot={`${stats.authors.reduce((n, a) => n + a.projects, 0)} projects between them`}
            />
            <Kpi
              label="Messages"
              icon="person"
              value={totalMessages.toLocaleString()}
              foot={`${stats.authors.reduce((n, a) => n + (a.turns ?? 0), 0).toLocaleString()} Claude turns back`}
            />
            <Kpi
              label="Cost"
              icon="coin"
              value={fmtCost(stats.totals.cost)}
              foot={`${fmtTokens(totalTokens)} tokens, all time`}
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
            <ViewToggle
              label="Date range"
              value={range}
              onChange={setRange}
              options={Object.keys(RANGE_DAYS).map((r) => ({ value: r, label: r }))}
            />
          </div>
          {!series ? (
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
              ariaLabel={`Messages per day over the last ${days} days`}
            />
          )}
        </section>

        <section className="panel col-4">
          <div className="panel-head">
            <div>
              <h4>Model mix</h4>
              <p className="panel-sub">Share of tokens, last {days} days.</p>
            </div>
          </div>
          {!series ? (
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
            <PeopleTable authors={stats.authors} />
          ) : (
            <div className="grid">
              {stats.authors.map((a) => (
                <PersonCard key={a.author} a={a} />
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

function PersonCard({ a }: { a: AuthorSummary }) {
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
      </div>
    </article>
  );
}

// No delete column here — `DELETE /api/authors` doesn't exist, so there'd be nothing for a
// per-row action to call.
function PeopleTable({ authors }: { authors: AuthorSummary[] }) {
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
      render: (a) => (
        <span title={`${a.turns?.toLocaleString() ?? 0} Claude turns`}>
          {a.userMessages?.toLocaleString() ?? '—'}
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
    <DataTable columns={columns} rows={authors} rowKey={(a) => a.author} caption="People" ariaLabel="People" />
  );
}
