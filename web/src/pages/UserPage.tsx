import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SessionSummary } from '@claudelens/shared';
import { listSessions, deleteProject, deleteSession } from '../api.js';
import { fmtDate, fmtCost, fmtTokens, msgCount } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Stat } from '../components/Stat.js';
import { Kpi, KpiSkeleton } from '../components/Kpi.js';
import { Icon } from '../components/Icon.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { ViewToggle } from '../components/ViewToggle.js';
import { SessionList } from '../components/SessionList.js';
import { DataTable, type Column } from '../components/DataTable.js';
import { DateRangePicker } from '../components/DateRangePicker.js';
import { useFetch } from '../useFetch.js';
import { useDateRange, usePref, useLayoutPref } from '../usePref.js';

const LIMIT = 50;

interface ProjectGroup {
  project: string;
  sessions: number;
  turns: number;
  messages: number;
  tokens: number;
  cost: number;
  skills: Set<string>;
  lastActivity?: string;
}

export function UserPage() {
  const { author = '' } = useParams<{ author: string }>();
  const [viewRaw, setView] = usePref('view', 'grouped');
  const view = viewRaw === 'flat' ? 'flat' : 'grouped';
  const [layout, setLayout] = useLayoutPref();
  const { range, from, to, customFrom, customTo, apply } = useDateRange();

  const {
    data: rows,
    err,
    refetch,
  } = useFetch<SessionSummary[]>(
    (signal) => listSessions({ author, limit: 500, from: from.toISOString(), to: to.toISOString() }, signal),
    [author, range, customFrom, customTo],
  );
  const [pending, setPending] = useState<ProjectGroup | null>(null);

  // Flat view: a separate paginated fetch — grouped view keeps the full client-side grouping
  // below, flat view pages through listSessions with limit/offset.
  const [flatRows, setFlatRows] = useState<SessionSummary[]>([]);
  const [flatOffset, setFlatOffset] = useState(0);
  const [flatDone, setFlatDone] = useState(false);
  const [flatLoaded, setFlatLoaded] = useState(false);
  const [pendingSession, setPendingSession] = useState<SessionSummary | null>(null);

  useEffect(() => {
    setFlatRows([]);
    setFlatOffset(0);
    setFlatDone(false);
    setFlatLoaded(false);
  }, [author, view, range, customFrom, customTo]);

  useEffect(() => {
    if (view !== 'flat') return;
    const ac = new AbortController();
    listSessions({ author, limit: LIMIT, offset: flatOffset, from: from.toISOString(), to: to.toISOString() }, ac.signal)
      .then((page) => {
        setFlatRows((prev) => (flatOffset === 0 ? page : [...prev, ...page]));
        setFlatDone(page.length < LIMIT);
        setFlatLoaded(true);
      })
      .catch(() => setFlatLoaded(true));
    return () => ac.abort();
  }, [author, view, flatOffset, range, customFrom, customTo]);

  async function confirmDeleteSession() {
    if (!pendingSession) return;
    await deleteSession(pendingSession.id);
    setFlatRows((prev) => prev.filter((s) => s.id !== pendingSession.id));
    setPendingSession(null);
  }

  const groups = useMemo<ProjectGroup[]>(() => {
    if (!rows) return [];
    const m = new Map<string, ProjectGroup>();
    for (const s of rows) {
      const key = s.project || '(no project)';
      const g =
        m.get(key) ??
        { project: key, sessions: 0, turns: 0, messages: 0, tokens: 0, cost: 0, skills: new Set() };
      g.sessions += 1;
      g.turns += s.stats.turns;
      g.messages += msgCount(s.stats);
      g.tokens += s.stats.totalTokens;
      g.cost += s.stats.estimatedCostUsd ?? 0;
      s.stats.skills.forEach((sk) => g.skills.add(sk));
      const when = s.startedAt ?? s.createdAt;
      if (!g.lastActivity || when > g.lastActivity) g.lastActivity = when;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.sessions - a.sessions);
  }, [rows]);

  const summary = useMemo(() => {
    const sessions = rows?.length ?? 0;
    const turns = rows?.reduce((n, s) => n + s.stats.turns, 0) ?? 0;
    const messages = rows?.reduce((n, s) => n + msgCount(s.stats), 0) ?? 0;
    const tokens = rows?.reduce((n, s) => n + s.stats.totalTokens, 0) ?? 0;
    const cost = rows?.reduce((n, s) => n + (s.stats.estimatedCostUsd ?? 0), 0) ?? 0;
    const skills = new Map<string, number>();
    rows?.forEach((s) => s.stats.skills.forEach((sk) => skills.set(sk, (skills.get(sk) ?? 0) + 1)));
    const topSkills = [...skills.entries()].sort((a, b) => b[1] - a[1]);
    return { sessions, turns, messages, tokens, cost, projects: groups.length, topSkills };
  }, [rows, groups.length]);

  const maxSkill = Math.max(1, ...summary.topSkills.map((s) => s[1]));

  async function confirmDeleteProject() {
    if (!pending) return;
    await deleteProject(author, pending.project);
    setPending(null);
    refetch();
  }

  return (
    <Shell
      crumbs={[{ label: author }]}
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
            <h1>{author}</h1>
            <p className="entity-sub">
              {summary.projects} {summary.projects === 1 ? 'project' : 'projects'} ·{' '}
              {summary.sessions} {summary.sessions === 1 ? 'session' : 'sessions'}
            </p>
          </div>
        </div>
      </div>

      <div className="kpi-row">
        {!rows ? (
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
            <Kpi label="Cost" icon="coin" value={fmtCost(summary.cost)} foot="from the transcript" />
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
                  ? `Projects ${author} has worked in. Open one to see its sessions.`
                  : `Every session ${author} has run, newest first.`}
              </p>
            </div>
            <div className="controls" style={{ margin: 0 }}>
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
            !rows ? (
              <div className="skel" style={{ height: 260, borderRadius: 'var(--r-lg)' }} />
            ) : groups.length === 0 ? (
              <EmptyForAuthor author={author} />
            ) : layout === 'table' ? (
              <ProjectTable groups={groups} author={author} onDelete={setPending} />
            ) : (
              <div className="grid">
                {groups.map((g) => (
                  <article key={g.project} className="card">
                    <Link
                      className="card-link"
                      aria-label={g.project}
                      to={`/u/${encodeURIComponent(author)}/${encodeURIComponent(g.project)}`}
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
                        {g.skills.size > 0 && (
                          <>
                            <span className="dot">·</span>
                            <span>
                              {g.skills.size} {g.skills.size === 1 ? 'skill' : 'skills'}
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
          ) : !flatLoaded ? (
            <div className="skel" style={{ height: 260, borderRadius: 'var(--r-lg)' }} />
          ) : flatRows.length === 0 ? (
            <EmptyForAuthor author={author} />
          ) : (
            <>
              <SessionList
                sessions={flatRows}
                layout={layout}
                showProject
                onDelete={(s) => setPendingSession(s)}
              />
              {!flatDone && (
                <div className="load-more">
                  <button
                    type="button"
                    className="chip"
                    disabled={!flatLoaded}
                    onClick={() => setFlatOffset((o) => o + LIMIT)}
                  >
                    {flatLoaded ? 'Load more' : 'Loading…'}
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
            This permanently deletes all {pending?.sessions ?? 0} session(s) in “{pending?.project}”
            by {author}. This cannot be undone.
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
  author,
  onDelete,
}: {
  groups: ProjectGroup[];
  author: string;
  onDelete: (g: ProjectGroup) => void;
}) {
  const columns: Column<ProjectGroup>[] = [
    {
      key: 'project',
      header: 'Project',
      sortable: true,
      sortValue: (g) => g.project,
      render: (g) => (
        <Link className="mono" to={`/u/${encodeURIComponent(author)}/${encodeURIComponent(g.project)}`}>
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
