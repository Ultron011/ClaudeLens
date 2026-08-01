import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SessionSummary } from '@claudelens/shared';
import { listSessions, deleteProject, deleteSession } from '../api.js';
import { fmtDate, fmtCost, fmtTokens, msgCount } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Stat } from '../components/Stat.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { ViewToggle } from '../components/ViewToggle.js';
import { SessionList } from '../components/SessionList.js';
import { DataTable, type Column } from '../components/DataTable.js';
import { useFetch } from '../useFetch.js';
import { usePref } from '../usePref.js';

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
  const [layoutRaw, setLayout] = usePref('layout', 'cards');
  const layout = layoutRaw === 'table' ? 'table' : 'cards';

  const {
    data: rows,
    err,
    refetch,
  } = useFetch<SessionSummary[]>((signal) => listSessions({ author }, signal), [author]);
  const [pending, setPending] = useState<ProjectGroup | null>(null);

  // Flat view: a separate paginated fetch (§5 spec — grouped view keeps the full client-side
  // grouping above, flat view pages through listSessions with limit/offset).
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
  }, [author, view]);

  useEffect(() => {
    if (view !== 'flat') return;
    const ac = new AbortController();
    listSessions({ author, limit: LIMIT, offset: flatOffset }, ac.signal)
      .then((page) => {
        setFlatRows((prev) => (flatOffset === 0 ? page : [...prev, ...page]));
        setFlatDone(page.length < LIMIT);
        setFlatLoaded(true);
      })
      .catch(() => setFlatLoaded(true));
    return () => ac.abort();
  }, [author, view, flatOffset]);

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
    const skills = new Map<string, number>();
    rows?.forEach((s) => s.stats.skills.forEach((sk) => skills.set(sk, (skills.get(sk) ?? 0) + 1)));
    const topSkills = [...skills.entries()].sort((a, b) => b[1] - a[1]);
    return { sessions, turns, messages, projects: groups.length, topSkills };
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
        <Link to={`/analytics/u/${encodeURIComponent(author)}`} className="chip">
          Analytics
        </Link>
      }
    >
      <div className="layout">
        <aside className="sidebar">
          <div className="panel">
            <div className="entity-head" style={{ marginBottom: 4 }}>
              <span className="avatar avatar-lg" aria-hidden>
                {author.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h4 style={{ margin: 0, color: 'var(--text)', textTransform: 'none', fontSize: 15 }}>
                  {author}
                </h4>
                <span className="muted">{summary.projects} projects</span>
              </div>
            </div>
          </div>
          <div className="panel totals">
            <div className="total">
              <div className="total-value">{summary.sessions}</div>
              <div className="total-label">sessions</div>
            </div>
            <div className="total" title={`${summary.turns.toLocaleString()} Claude turns`}>
              <div className="total-value">{summary.messages.toLocaleString()}</div>
              <div className="total-label">messages</div>
            </div>
            <div className="total">
              <div className="total-value">{summary.projects}</div>
              <div className="total-label">projects</div>
            </div>
          </div>
          {summary.topSkills.length > 0 && (
            <div className="panel">
              <h4>Their skills</h4>
              <ul className="barlist">
                {summary.topSkills.slice(0, 10).map(([sk, n]) => (
                  <li key={sk}>
                    <span className="bar-label">/{sk}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${(n / maxSkill) * 100}%` }} />
                    </span>
                    <span className="bar-count">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <main className="content">
          <div className="content-head">
            <h1>{view === 'grouped' ? 'Projects' : 'Sessions'}</h1>
            <p className="lede">
              {view === 'grouped'
                ? `Projects ${author} has worked in. Open one to see its sessions.`
                : `Every session ${author} has run, across all projects.`}
            </p>
          </div>

          <div className="controls">
            <ViewToggle
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: 'grouped', label: 'Grouped by project' },
                { value: 'flat', label: 'All sessions' },
              ]}
            />
            <ViewToggle
              label="Layout"
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'cards', label: 'Cards' },
                { value: 'table', label: 'Table' },
              ]}
            />
          </div>

          {err ? (
            <div className="empty">
              <h3>Can’t reach the server</h3>
              <p className="muted">{err}</p>
            </div>
          ) : view === 'grouped' ? (
            !rows ? (
              <div className="empty">Loading…</div>
            ) : groups.length === 0 ? (
              <div className="empty">
                <h3>No sessions</h3>
                <p className="muted">Nothing from {author} yet.</p>
              </div>
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
                            ▸
                          </span>
                          <h3 className="card-title mono">{g.project}</h3>
                        </div>
                      </div>
                      <div className="card-meta">
                        <span>last active {fmtDate(g.lastActivity)}</span>
                        {g.skills.size > 0 && (
                          <>
                            <span className="dot">·</span>
                            <span>{g.skills.size} skills</span>
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
                        className="chip danger"
                        aria-label={`Delete project ${g.project}`}
                        onClick={() => setPending(g)}
                      >
                        ⨯
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : !flatLoaded ? (
            <div className="empty">Loading…</div>
          ) : flatRows.length === 0 ? (
            <div className="empty">
              <h3>No sessions</h3>
              <p className="muted">Nothing from {author} yet.</p>
            </div>
          ) : (
            <>
              <SessionList
                sessions={flatRows}
                layout={layout}
                showProject
                onDelete={(s) => setPendingSession(s)}
              />
              {!flatDone && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button type="button" className="chip" onClick={() => setFlatOffset((o) => o + LIMIT)}>
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </main>
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
          className="chip danger"
          aria-label={`Delete project ${g.project}`}
          onClick={() => onDelete(g)}
        >
          ⨯
        </button>
      ),
    },
  ];
  return (
    <DataTable columns={columns} rows={groups} rowKey={(g) => g.project} caption="Projects" ariaLabel="Projects" />
  );
}
