import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SessionSummary } from '@claudelens/shared';
import { listSessions } from '../api.js';
import { fmtDate } from '../format.js';
import { Shell } from '../components/Shell.js';

interface ProjectGroup {
  project: string;
  sessions: number;
  turns: number;
  skills: Set<string>;
  lastActivity?: string;
}

export function UserPage() {
  const { author = '' } = useParams<{ author: string }>();
  const [rows, setRows] = useState<SessionSummary[] | null>(null);

  useEffect(() => {
    setRows(null);
    listSessions({ author }).then(setRows).catch(() => setRows([]));
  }, [author]);

  const groups = useMemo<ProjectGroup[]>(() => {
    if (!rows) return [];
    const m = new Map<string, ProjectGroup>();
    for (const s of rows) {
      const key = s.project || '(no project)';
      const g = m.get(key) ?? { project: key, sessions: 0, turns: 0, skills: new Set() };
      g.sessions += 1;
      g.turns += s.stats.turns;
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
    const skills = new Map<string, number>();
    rows?.forEach((s) => s.stats.skills.forEach((sk) => skills.set(sk, (skills.get(sk) ?? 0) + 1)));
    const topSkills = [...skills.entries()].sort((a, b) => b[1] - a[1]);
    return { sessions, turns, projects: groups.length, topSkills };
  }, [rows, groups.length]);

  const maxSkill = Math.max(1, ...summary.topSkills.map((s) => s[1]));

  return (
    <Shell crumbs={[{ label: author }]}>
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
            <div className="total">
              <div className="total-value">{summary.turns.toLocaleString()}</div>
              <div className="total-label">turns</div>
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
            <h1>Projects</h1>
            <p className="lede">Projects {author} has worked in. Open one to see its sessions.</p>
          </div>

          {!rows ? (
            <div className="empty">Loading…</div>
          ) : groups.length === 0 ? (
            <div className="empty">
              <h3>No sessions</h3>
              <p className="muted">Nothing from {author} yet.</p>
            </div>
          ) : (
            <div className="grid">
              {groups.map((g) => (
                <Link
                  key={g.project}
                  to={`/u/${encodeURIComponent(author)}/${encodeURIComponent(g.project)}`}
                  className="card"
                >
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
                    <Stat label="turns" value={g.turns.toLocaleString()} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </Shell>
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
