import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SessionSummary } from '@claudelens/shared';
import { listSessions } from '../api.js';
import { fmtDate, fmtTokens } from '../format.js';
import { Shell } from '../components/Shell.js';

export function ProjectPage() {
  const { author = '', project = '' } = useParams<{ author: string; project: string }>();
  const [rows, setRows] = useState<SessionSummary[] | null>(null);

  useEffect(() => {
    setRows(null);
    // Fetch the author's sessions, filter to this project client-side
    // (handles the "(no project)" bucket without null-matching gymnastics).
    listSessions({ author }).then(setRows).catch(() => setRows([]));
  }, [author]);

  const sessions = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((s) => (s.project || '(no project)') === project)
      .sort((a, b) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt));
  }, [rows, project]);

  const summary = useMemo(() => {
    const turns = sessions.reduce((n, s) => n + s.stats.turns, 0);
    const tokens = sessions.reduce((n, s) => n + s.stats.totalTokens, 0);
    return { turns, tokens, count: sessions.length };
  }, [sessions]);

  return (
    <Shell crumbs={[{ label: author, to: `/u/${encodeURIComponent(author)}` }, { label: project }]}>
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
            <div className="total">
              <div className="total-value">{summary.turns.toLocaleString()}</div>
              <div className="total-label">turns</div>
            </div>
            <div className="total">
              <div className="total-value">{fmtTokens(summary.tokens)}</div>
              <div className="total-label">tokens</div>
            </div>
          </div>
        </aside>

        <main className="content">
          <div className="content-head">
            <h1>Sessions</h1>
            <p className="lede">Every session {author} ran in this project.</p>
          </div>

          {!rows ? (
            <div className="empty">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="empty">
              <h3>No sessions in this project</h3>
            </div>
          ) : (
            <div className="grid">
              {sessions.map((s) => (
                <SessionCard key={s.id} s={s} />
              ))}
            </div>
          )}
        </main>
      </div>
    </Shell>
  );
}

function SessionCard({ s }: { s: SessionSummary }) {
  const st = s.stats;
  return (
    <Link to={`/session/${s.id}`} className="card">
      <div className="card-head">
        <h3 className="card-title">{s.title}</h3>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {s.hidden && <span className="badge-hidden">hidden</span>}
          {s.featured && (
            <span className="star" title="Featured">
              ★
            </span>
          )}
        </div>
      </div>
      {s.note && <p className="card-note">{s.note}</p>}
      <div className="card-meta">
        <span>{fmtDate(s.startedAt ?? s.createdAt)}</span>
        {s.gitBranch && (
          <>
            <span className="dot">·</span>
            <span className="mono">{s.gitBranch}</span>
          </>
        )}
      </div>
      <div className="card-stats">
        <Stat label="turns" value={String(st.turns)} accent />
        <Stat label="tokens" value={fmtTokens(st.totalTokens)} />
      </div>
      {(st.skills.length > 0 || st.subagents.length > 0) && (
        <div className="card-skills">
          {st.skills.map((sk) => (
            <span key={sk} className="pill skill">
              /{sk}
            </span>
          ))}
          {st.subagents.map((a) => (
            <span key={a} className="pill agent">
              @{a}
            </span>
          ))}
        </div>
      )}
      {s.tags.length > 0 && (
        <div className="card-tags">
          {s.tags.map((t) => (
            <span key={t} className="tag mini">
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="stat">
      <div className={accent ? 'stat-value accent' : 'stat-value'}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
