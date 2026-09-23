import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { SessionSummary } from '@claudelens/shared';
import { getProjects, deleteProject, deleteSession, type ProjectsResponse } from '../api.js';
import { fmtDate, fmtCost, fmtTokens } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Stat } from '../components/Stat.js';
import { Kpi, KpiSkeleton } from '../components/Kpi.js';
import { Icon } from '../components/Icon.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { ViewToggle } from '../components/ViewToggle.js';
import { SessionList } from '../components/SessionList.js';
import { DataTable, type Column } from '../components/DataTable.js';
import { DateRangePicker } from '../components/DateRangePicker.js';
import { useOrgStats } from '../components/AppLayout.js';
import { useFetch } from '../useFetch.js';
import { useDateRange, usePref, useLayoutPref } from '../usePref.js';
import { usePagedSessions } from '../usePagedSessions.js';

interface ProjectGroup {
  project: string;
  sessions: number;
  turns: number;
  messages: number;
  tokens: number;
  cost: number;
  skills: string[];
  lastActivity?: string;
}

export function UserPage() {
  const { author = '' } = useParams<{ author: string }>();
  const { search } = useLocation();
  const [viewRaw, setView] = usePref('view', 'grouped');
  const view = viewRaw === 'flat' ? 'flat' : 'grouped';
  const [layout, setLayout] = useLayoutPref();
  const { range, from, to, customFrom, customTo, apply } = useDateRange();
  const [sort, setSort] = usePref('sort', 'recent');
  const [projectFilter, setProjectFilter] = useState('');
  const { stats } = useOrgStats();
  // Show the display name the rest of the UI uses; the raw author string stays in URLs.
  const label = stats?.authors.find((a) => a.author === author)?.label ?? author;

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  // Every KPI, project row and skill count is aggregated server-side. This page used to fold a
  // 500-row fetch client-side, which silently understated the heaviest users (1,267 sessions).
  const {
    data: rollup,
    err,
    refetch,
  } = useFetch<ProjectsResponse>(
    (signal) => getProjects(author, fromIso, toIso, signal),
    [author, fromIso, toIso],
  );
  const [pending, setPending] = useState<ProjectGroup | null>(null);

  const flatQuery = { author, from: fromIso, to: toIso, sort };
  const flat = usePagedSessions(flatQuery, view === 'flat' ? JSON.stringify(flatQuery) : 'off');
  const [pendingSession, setPendingSession] = useState<SessionSummary | null>(null);

  async function confirmDeleteSession() {
    if (!pendingSession) return;
    await deleteSession(pendingSession.id);
    flat.remove(pendingSession.id);
    setPendingSession(null);
    refetch();
  }

  const groups = useMemo<ProjectGroup[]>(
    () =>
      (rollup?.projects ?? []).map((p) => ({
        project: p.project,
        sessions: p.sessions,
        turns: p.turns,
        messages: p.messages,
        tokens: Number(p.tokens) || 0,
        cost: Number(p.cost) || 0,
        skills: p.skills,
        lastActivity: p.lastActivity,
      })),
    [rollup],
  );
  const shownGroups = projectFilter
    ? groups.filter((g) => g.project.toLowerCase().includes(projectFilter.toLowerCase()))
    : groups;

  const t = rollup?.totals;
  const summary = {
    sessions: t?.sessions ?? 0,
    turns: t?.turns ?? 0,
    messages: t?.messages ?? 0,
    tokens: Number(t?.tokens) || 0,
    cost: Number(t?.cost) || 0,
    projects: t?.projects ?? 0,
    topSkills: (rollup?.skills ?? []).map((s) => [s.skill, s.uses] as [string, number]),
  };

  const maxSkill = Math.max(1, ...summary.topSkills.map((s) => s[1]));
  const projectHref = (p: string) => `/u/${encodeURIComponent(author)}/${encodeURIComponent(p)}${search}`;

  async function confirmDeleteProject() {
    if (!pending) return;
    await deleteProject(author, pending.project);
    setPending(null);
    refetch();
  }

  return (
    <Shell
      crumbs={[{ label }]}
      actions={
        <>
          <Link to={`/analytics/u/${encodeURIComponent(author)}`} className="chip">
            <Icon name="chart" size={13} />
            Analytics
          </Link>
          <DateRangePicker range={range} customFrom={customFrom} customTo={customTo} onApply={apply} />
        </>
      }
    >
      <div className="page-head">
        <div className="entity-head">
          <span className="avatar avatar-lg" aria-hidden>
            {author.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1>{label}</h1>
            <p className="entity-sub">
              {summary.projects} {summary.projects === 1 ? 'project' : 'projects'} ·{' '}
              {summary.sessions} {summary.sessions === 1 ? 'session' : 'sessions'}
            </p>
          </div>
        </div>
      </div>

      <div className="kpi-row">
        {!rollup ? (
          <>
            <KpiSkeleton label="Sessions" />
            <KpiSkeleton label="Messages" />
            <KpiSkeleton label="Tokens" />
            <KpiSkeleton label="Cost" />
          </>
        ) : (
          <>
            <Kpi label="Sessions" icon="message" value={String(summary.sessions)} foot={`across ${summary.projects} projects`} primary />
            <Kpi
              label="Messages"
              icon="person"
              value={summary.messages.toLocaleString()}
              foot={`${summary.turns.toLocaleString()} Claude turns back`}
            />
            <Kpi label="Tokens" icon="layers" value={fmtTokens(summary.tokens)} foot="input + output + cache" />
            <Kpi label="Cost" icon="coin" value={fmtCost(summary.cost)} foot="estimated from tokens" />
          </>
        )}
      </div>

      <div className="bento">
        <section className="col-9">
          <div className="panel-head">
            <div>
              <h4>{view === 'grouped' ? 'Projects' : 'All sessions'}</h4>
              <p className="panel-sub">
                {view === 'grouped'
                  ? `Projects ${label} worked in during this range. Open one to see its sessions.`
                  : `Every session ${label} ran in this range.`}
              </p>
            </div>
            <div className="controls" style={{ margin: 0 }}>
              {view === 'grouped' && groups.length > 8 && (
                <input
                  type="search"
                  className="inline-filter"
                  placeholder="Filter projects…"
                  aria-label="Filter projects"
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                />
              )}
              <ViewToggle
                label="View"
                value={view}
                onChange={setView}
                options={[
                  { value: 'grouped', label: 'By project' },
                  { value: 'flat', label: 'All sessions' },
                ]}
              />
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
          </div>

          {err ? (
            <div className="empty">
              <Icon name="cpu" size={22} className="empty-icon" />
              <h3>Can’t reach the server</h3>
              <p className="muted">{err}</p>
            </div>
          ) : view === 'grouped' ? (
            !rollup ? (
              <div className="skel" style={{ height: 260, borderRadius: 'var(--r-lg)' }} />
            ) : groups.length === 0 ? (
              <EmptyForAuthor author={label} />
            ) : shownGroups.length === 0 ? (
              <p className="muted">No project matches “{projectFilter}”.</p>
            ) : layout === 'table' ? (
              <ProjectTable groups={shownGroups} href={projectHref} onDelete={setPending} />
            ) : (
              <div className="grid">
                {shownGroups.map((g) => (
                  <article key={g.project} className="card">
                    <Link
                      className="card-link"
                      aria-label={g.project}
                      to={projectHref(g.project)}
                    />
                    <div className="card-content">
                      <div className="card-head">
                        <div className="person">
                          <span className="folder-badge" aria-hidden>
                            <Icon name="folder" />
                          </span>
                          <h3 className="card-title mono">{g.project}</h3>
                        </div>
                      </div>
                      <div className="card-meta">
                        <span>last active {fmtDate(g.lastActivity)}</span>
                        {g.skills.length > 0 && (
                          <>
                            <span className="dot">·</span>
                            <span>
                              {g.skills.length} {g.skills.length === 1 ? 'skill' : 'skills'}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="card-stats">
                        <Stat label="sessions" value={String(g.sessions)} accent />
                        <Stat
                          label="messages"
                          value={g.messages.toLocaleString()}
                          title={`${g.turns.toLocaleString()} Claude turns`}
                        />
                        <Stat label="cost" value={fmtCost(g.cost)} />
                      </div>
                    </div>
                    <div className="card-actions">
                      <button
                        type="button"
                        className="chip danger icon"
                        aria-label={`Delete project ${g.project}`}
                        onClick={() => setPending(g)}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : flat.err ? (
            <div className="empty">
              <Icon name="cpu" size={22} className="empty-icon" />
              <h3>Can’t load sessions</h3>
              <p className="muted">{flat.err}</p>
            </div>
          ) : !flat.loaded ? (
            <div className="skel" style={{ height: 260, borderRadius: 'var(--r-lg)' }} />
          ) : flat.sessions.length === 0 ? (
            <EmptyForAuthor author={label} />
          ) : (
            <>
              <SessionList
                sessions={flat.sessions}
                layout={layout}
                showProject
                onDelete={(s) => setPendingSession(s)}
                serverSort={{ value: sort, onChange: setSort }}
              />
              {!flat.done && (
                <div className="load-more">
                  <button type="button" className="chip" disabled={flat.loading} onClick={flat.loadMore}>
                    {flat.loading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <div className="col-3 stack">
          <section className="panel">
            <div className="panel-head tight">
              <h4>Their skills</h4>
            </div>
            {summary.topSkills.length === 0 ? (
              <p className="muted">No skills used in these sessions yet.</p>
            ) : (
              <ul className="barlist">
                {summary.topSkills.slice(0, 12).map(([sk, n]) => (
                  <li key={sk}>
                    <span className="bar-label">/{sk}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${(n / maxSkill) * 100}%` }} />
                    </span>
                    <span className="bar-count">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={!!pending}
        title={`Delete project “${pending?.project ?? ''}”?`}
        body={
          <>
            This permanently deletes every session in “{pending?.project}” by {label} — across all
            dates, not just the selected range. This cannot be undone.
          </>
        }
        typeToConfirm={pending?.project}
        onConfirm={confirmDeleteProject}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={!!pendingSession}
        title="Delete this session?"
        body={<>“{pendingSession?.title}” will be permanently deleted.</>}
        onConfirm={confirmDeleteSession}
        onCancel={() => setPendingSession(null)}
      />
    </Shell>
  );
}

function EmptyForAuthor({ author }: { author: string }) {
  return (
    <div className="empty">
      <Icon name="folder" size={22} className="empty-icon" />
      <h3>Nothing from {author} yet</h3>
      <p>
        Their sessions appear here automatically once they run Claude Code in a tracked project.
        Projects opted out with <code>/claudelens:untrack-project</code> never show up.
      </p>
    </div>
  );
}

function ProjectTable({
  groups,
  href,
  onDelete,
}: {
  groups: ProjectGroup[];
  href: (project: string) => string;
  onDelete: (g: ProjectGroup) => void;
}) {
  const columns: Column<ProjectGroup>[] = [
    {
      key: 'project',
      header: 'Project',
      sortable: true,
      sortValue: (g) => g.project,
      render: (g) => (
        <Link className="mono" to={href(g.project)}>
          {g.project}
        </Link>
      ),
    },
    {
      key: 'sessions',
      header: 'Sessions',
      numeric: true,
      sortable: true,
      sortValue: (g) => g.sessions,
      render: (g) => g.sessions,
    },
    {
      key: 'messages',
      header: 'Messages',
      numeric: true,
      sortable: true,
      sortValue: (g) => g.messages,
      render: (g) => <span title={`${g.turns.toLocaleString()} Claude turns`}>{g.messages.toLocaleString()}</span>,
    },
    {
      key: 'tokens',
      header: 'Tokens',
      numeric: true,
      sortable: true,
      sortValue: (g) => g.tokens,
      render: (g) => fmtTokens(g.tokens),
    },
    {
      key: 'cost',
      header: 'Cost',
      numeric: true,
      sortable: true,
      sortValue: (g) => g.cost,
      render: (g) => fmtCost(g.cost),
    },
    {
      key: 'lastActive',
      header: 'Last active',
      sortable: true,
      sortValue: (g) => g.lastActivity ?? '',
      render: (g) => fmtDate(g.lastActivity),
    },
    {
      key: 'delete',
      header: <span className="sr-only">Delete</span>,
      render: (g) => (
        <button
          type="button"
          className="chip danger icon row-action"
          aria-label={`Delete project ${g.project}`}
          onClick={() => onDelete(g)}
        >
          <Icon name="trash" size={13} />
        </button>
      ),
    },
  ];
  return (
    <DataTable columns={columns} rows={groups} rowKey={(g) => g.project} caption="Projects" ariaLabel="Projects" />
  );
}
