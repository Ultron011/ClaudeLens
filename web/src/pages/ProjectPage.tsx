import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { SessionSummary } from '@claudelens/shared';
import { listSessions, deleteProject, deleteSession } from '../api.js';
import { fmtTokens, fmtCost, msgCount } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Kpi, KpiSkeleton } from '../components/Kpi.js';
import { Icon } from '../components/Icon.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { ViewToggle } from '../components/ViewToggle.js';
import { SessionList } from '../components/SessionList.js';
import { useLayoutPref } from '../usePref.js';

const LIMIT = 50;

export function ProjectPage() {
  const { author = '', project = '' } = useParams<{ author: string; project: string }>();
  const nav = useNavigate();
  // One shared `layout` key across Overview, User and Project — `usePref` stores it under a
  // single localStorage entry, so differing defaults per page meant whichever page you touched
  // last silently changed the others. `useLayoutPref` centralises that default (table on a wide
  // screen, cards on a phone) so all three stay in step.
  const [layout, setLayout] = useLayoutPref();

  // Paginated, project-scoped fetch — accumulates across "Load more" clicks. Resets whenever
  // author/project changes.
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [offset, setOffset] = useState(0);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setSessions([]);
    setOffset(0);
    setDone(false);
    setLoaded(false);
  }, [author, project]);

  useEffect(() => {
    const ac = new AbortController();
    setLoadingMore(true);
    listSessions({ author, project, limit: LIMIT, offset }, ac.signal)
      .then((rows) => {
        setSessions((prev) => (offset === 0 ? rows : [...prev, ...rows]));
        setDone(rows.length < LIMIT);
        setLoaded(true);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setErr(String(e));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingMore(false);
      });
    return () => ac.abort();
  }, [author, project, offset]);

  // ponytail: totals reflect only the sessions loaded so far, not the whole project, once
  // "Load more" is in play. Full server-side totals would need a second endpoint — YAGNI until
  // someone actually has >50-session projects and complains.
  const summary = useMemo(() => {
    const turns = sessions.reduce((n, s) => n + s.stats.turns, 0);
    const messages = sessions.reduce((n, s) => n + msgCount(s.stats), 0);
    const tokens = sessions.reduce((n, s) => n + s.stats.totalTokens, 0);
    const cost = sessions.reduce((n, s) => n + (s.stats.estimatedCostUsd ?? 0), 0);

    // Side-panel material: what this project actually exercised. Counted over the loaded page,
    // same caveat as the totals above.
    const skills = new Map<string, number>();
    const subagents = new Map<string, number>();
    const models = new Map<string, number>();
    for (const s of sessions) {
      s.stats.skills.forEach((k) => skills.set(k, (skills.get(k) ?? 0) + 1));
      s.stats.subagents.forEach((k) => subagents.set(k, (subagents.get(k) ?? 0) + 1));
      s.stats.models.forEach((m) => models.set(m, (models.get(m) ?? 0) + 1));
    }
    const bycount = (a: [string, number], b: [string, number]) => b[1] - a[1];
    return {
      turns,
      messages,
      tokens,
      cost,
      count: sessions.length,
      skills: [...skills.entries()].sort(bycount),
      subagents: [...subagents.entries()].sort(bycount),
      models: [...models.entries()].sort(bycount),
    };
  }, [sessions]);

  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [pendingSession, setPendingSession] = useState<SessionSummary | null>(null);

  async function confirmDeleteProject() {
    await deleteProject(author, project);
    setDeleteProjectOpen(false);
    nav(`/u/${encodeURIComponent(author)}`, { replace: true });
  }

  async function confirmDeleteSession() {
    if (!pendingSession) return;
    await deleteSession(pendingSession.id);
    setSessions((prev) => prev.filter((s) => s.id !== pendingSession.id));
    setPendingSession(null);
  }

  return (
    <Shell
      crumbs={[{ label: author, to: `/u/${encodeURIComponent(author)}` }, { label: project }]}
      actions={
        sessions.length > 0 ? (
          <button className="chip danger" onClick={() => setDeleteProjectOpen(true)}>
            <Icon name="trash" size={13} />
            Delete project
          </button>
        ) : undefined
      }
    >
      <div className="page-head">
        <div className="entity-head">
          <span className="folder-badge avatar-lg" aria-hidden>
            <Icon name="folder" size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h1 className="mono">{project}</h1>
            <p className="entity-sub">
              by <Link to={`/u/${encodeURIComponent(author)}`}>{author}</Link>
            </p>
          </div>
        </div>
        <div className="page-head-actions">
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

      <div className="kpi-row">
        {!loaded ? (
          <>
            <KpiSkeleton label="Sessions" />
            <KpiSkeleton label="Messages" />
            <KpiSkeleton label="Tokens" />
            <KpiSkeleton label="Cost" />
          </>
        ) : (
          <>
            <Kpi label="Sessions" icon="message" value={String(summary.count)} foot={done ? 'all loaded' : 'loaded so far'} primary />
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

      {/* Same bento as UserPage — sessions in the wide cell, a narrow stack of what the project
       * exercised beside it. Before this, Project was the one page with no bento: a bare
       * auto-fill card grid that sharded two sessions across four tracks and left the rest of
       * the viewport empty. */}
      <div className="bento">
        <section className="col-9">
          <div className="panel-head">
            <div>
              <h4>Sessions</h4>
              <p className="panel-sub">Every session {author} ran in this project, newest first.</p>
            </div>
          </div>

          {err ? (
            <div className="empty">
              <Icon name="cpu" size={22} className="empty-icon" />
              <h3>Can’t reach the server</h3>
              <p className="muted">{err}</p>
            </div>
          ) : !loaded ? (
            <div className="skel" style={{ height: 300, borderRadius: 'var(--r-lg)' }} />
          ) : sessions.length === 0 ? (
            <div className="empty">
              <Icon name="message" size={22} className="empty-icon" />
              <h3>No sessions in this project</h3>
              <p>
                Either nothing has run here yet, or the project was opted out with{' '}
                <code>/claudelens:untrack-project</code>.
              </p>
            </div>
          ) : (
            <>
              <SessionList sessions={sessions} layout={layout} onDelete={(s) => setPendingSession(s)} />
              {!done && (
                <div className="load-more">
                  <button
                    type="button"
                    className="chip"
                    disabled={loadingMore}
                    onClick={() => setOffset((o) => o + LIMIT)}
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <div className="col-3 stack">
          <section className="panel">
            <div className="panel-head tight">
              <h4>Skills used here</h4>
            </div>
            {summary.skills.length === 0 && summary.subagents.length === 0 ? (
              <p className="muted">No skills or subagents in these sessions.</p>
            ) : (
              <div className="card-skills">
                {summary.skills.map(([sk, n]) => (
                  <span key={sk} className="pill skill">
                    /{sk} <span className="tag-count">{n}</span>
                  </span>
                ))}
                {summary.subagents.map(([a, n]) => (
                  <span key={a} className="pill agent">
                    @{a} <span className="tag-count">{n}</span>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head tight">
              <h4>Models</h4>
            </div>
            {summary.models.length === 0 ? (
              <p className="muted">No model usage recorded.</p>
            ) : (
              <ul className="barlist">
                {summary.models.map(([m, n]) => (
                  <li key={m}>
                    <span className="bar-label tool">{m}</span>
                    <span className="bar-track">
                      <span
                        className="bar-fill"
                        style={{ width: `${(n / Math.max(1, summary.count)) * 100}%` }}
                      />
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
        open={deleteProjectOpen}
        title={`Delete project “${project}”?`}
        body={
          <>
            This permanently deletes all {sessions.length} session(s) in “{project}” by {author}.
            This cannot be undone.
          </>
        }
        typeToConfirm={project}
        onConfirm={confirmDeleteProject}
        onCancel={() => setDeleteProjectOpen(false)}
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