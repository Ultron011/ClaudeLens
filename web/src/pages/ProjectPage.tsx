import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SessionSummary } from '@claudelens/shared';
import { listSessions, deleteProject, deleteSession } from '../api.js';
import { fmtTokens, fmtCost, msgCount } from '../format.js';
import { Shell } from '../components/Shell.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { ViewToggle } from '../components/ViewToggle.js';
import { SessionList } from '../components/SessionList.js';
import { usePref } from '../usePref.js';

const LIMIT = 50;

export function ProjectPage() {
  const { author = '', project = '' } = useParams<{ author: string; project: string }>();
  const nav = useNavigate();
  const [layoutRaw, setLayout] = usePref('layout', 'cards');
  const layout = layoutRaw === 'table' ? 'table' : 'cards';

  // Paginated, project-scoped fetch — accumulates across "Load more" clicks. Resets whenever
  // author/project changes.
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [offset, setOffset] = useState(0);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSessions([]);
    setOffset(0);
    setDone(false);
    setLoaded(false);
  }, [author, project]);

  useEffect(() => {
    const ac = new AbortController();
    listSessions({ author, project, limit: LIMIT, offset }, ac.signal)
      .then((rows) => {
        setSessions((prev) => (offset === 0 ? rows : [...prev, ...rows]));
        setDone(rows.length < LIMIT);
        setLoaded(true);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setErr(String(e));
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
    return { turns, messages, tokens, cost, count: sessions.length };
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
            Delete project
          </button>
        ) : undefined
      }
    >
      <div className="layout">
        <aside className="sidebar">
          <div className="panel">
            <div className="entity-head" style={{ marginBottom: 4 }}>
              <span className="folder-badge avatar-lg" aria-hidden style={{ fontSize: 20 }}>
                ▸
              </span>
              <div>
                <h4
                  className="mono"
                  style={{ margin: 0, color: 'var(--text)', textTransform: 'none', fontSize: 14 }}
                >
                  {project}
                </h4>
                <span className="muted">by {author}</span>
              </div>
            </div>
          </div>
          <div className="panel totals">
            <div className="total">
              <div className="total-value">{summary.count}</div>
              <div className="total-label">sessions</div>
            </div>
            <div className="total" title={`${summary.turns.toLocaleString()} Claude turns`}>
              <div className="total-value">{summary.messages.toLocaleString()}</div>
              <div className="total-label">messages</div>
            </div>
            <div className="total">
              <div className="total-value">{fmtTokens(summary.tokens)}</div>
              <div className="total-label">tokens</div>
            </div>
            <div className="total">
              <div className="total-value">{fmtCost(summary.cost)}</div>
              <div className="total-label">cost</div>
            </div>
          </div>
        </aside>

        <main className="content">
          <div className="content-head">
            <h1>Sessions</h1>
            <p className="lede">Every session {author} ran in this project.</p>
          </div>

          <div className="controls">
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
          ) : !loaded ? (
            <div className="empty">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="empty">
              <h3>No sessions in this project</h3>
            </div>
          ) : (
            <>
              <SessionList sessions={sessions} layout={layout} onDelete={(s) => setPendingSession(s)} />
              {!done && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button type="button" className="chip" onClick={() => setOffset((o) => o + LIMIT)}>
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </main>
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