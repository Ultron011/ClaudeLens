import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStats, type OrgStats, type AuthorSummary } from '../api.js';
import { Shell } from '../components/Shell.js';

export function OverviewPage() {
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getStats().then(setStats).catch((e) => setErr(String(e)));
  }, []);

  return (
    <Shell tagline="how your team works with Claude Code">
      <div className="layout">
        <aside className="sidebar">
          <StatPanel stats={stats} />
        </aside>

        <main className="content">
          <div className="content-head">
            <h1>People</h1>
            <p className="lede">
              Pick a teammate to see their projects, then drill into any session’s full transcript.
            </p>
          </div>

          {err ? (
            <div className="empty">
              <h3>Can’t reach the server</h3>
              <p className="muted">{err}</p>
            </div>
          ) : !stats ? (
            <div className="empty">Loading…</div>
          ) : stats.authors.length === 0 ? (
            <div className="empty">
              <h3>No sessions yet</h3>
              <p>
                Install the plugin and run <code>/claudelens:setup</code>. Tracked sessions sync
                here automatically after each turn.
              </p>
            </div>
          ) : (
            <div className="grid">
              {stats.authors.map((a) => (
                <PersonCard key={a.author} a={a} />
              ))}
            </div>
          )}
        </main>
      </div>
    </Shell>
  );
}

function PersonCard({ a }: { a: AuthorSummary }) {
  return (
    <Link to={`/u/${encodeURIComponent(a.author)}`} className="card">
      <div className="card-head">
        <div className="person">
          <span className="avatar" aria-hidden>
            {a.author.slice(0, 1).toUpperCase()}
          </span>
          <h3 className="card-title">{a.author}</h3>
        </div>
        {a.featured > 0 && (
          <span className="star" title={`${a.featured} featured`}>
            ★
          </span>
        )}
      </div>
      <div className="card-stats">
        <Stat label="projects" value={String(a.projects)} />
        <Stat label="sessions" value={String(a.sessions)} />
        <Stat label="turns" value={a.turns?.toLocaleString() ?? '—'} accent />
      </div>
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

function StatPanel({ stats }: { stats: OrgStats | null }) {
  if (!stats) return <div className="panel">Loading stats…</div>;
  const maxSkill = Math.max(1, ...stats.skills.map((s) => s.uses));
  const totalTurns = stats.authors.reduce((n, a) => n + (a.turns ?? 0), 0);
  return (
    <>
      <div className="panel totals">
        <div className="total">
          <div className="total-value">{stats.totals.sessions}</div>
          <div className="total-label">sessions</div>
        </div>
        <div className="total">
          <div className="total-value">{stats.totals.authors}</div>
          <div className="total-label">people</div>
        </div>
        <div className="total">
          <div className="total-value">{totalTurns.toLocaleString()}</div>
          <div className="total-label">turns</div>
        </div>
      </div>

      <div className="panel">
        <h4>Contributors</h4>
        <ul className="leaderboard">
          {stats.authors.slice(0, 8).map((a, i) => (
            <li key={a.author}>
              <Link to={`/u/${encodeURIComponent(a.author)}`}>
                <span className="rank">{i + 1}</span>
                <span className="name">{a.author}</span>
                <span className="count">{a.sessions}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h4>Skills in use</h4>
        {stats.skills.length === 0 && <p className="muted">No skills shared yet.</p>}
        <ul className="barlist">
          {stats.skills.slice(0, 10).map((s) => (
            <li key={s.skill}>
              <span className="bar-label">/{s.skill}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(s.uses / maxSkill) * 100}%` }} />
              </span>
              <span className="bar-count">{s.uses}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h4>Top tools</h4>
        <div className="toolcloud">
          {stats.tools.slice(0, 14).map((t) => (
            <span key={t.tool} className="pill tool">
              {t.tool} <span className="tag-count">{t.uses}</span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
