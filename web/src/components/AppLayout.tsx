import { createContext, useContext } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { getStats, type OrgStats } from '../api.js';
import { useFetch } from '../useFetch.js';
import { Icon, Logo } from './Icon.js';

/** Org stats, fetched once for the whole app.
 *
 * This is a layout route (see main.tsx), so it mounts once and survives every navigation — the
 * rail never flickers and pages that need org-wide totals read them from here instead of issuing
 * their own duplicate `/api/stats` request. */
const StatsCtx = createContext<{ stats: OrgStats | null; err: string; loading: boolean }>({
  stats: null,
  err: '',
  loading: true,
});

export const useOrgStats = () => useContext(StatsCtx);

export function AppLayout() {
  const { data: stats, err, loading } = useFetch<OrgStats>((signal) => getStats(signal), []);

  return (
    <StatsCtx.Provider value={{ stats, err, loading }}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-shell">
        <SideNav stats={stats} />
        <div className="app-main">
          <Outlet />
        </div>
      </div>
    </StatsCtx.Provider>
  );
}

function SideNav({ stats }: { stats: OrgStats | null }) {
  const { pathname } = useLocation();
  const people = stats?.authors ?? [];

  return (
    <nav className="sidenav" aria-label="Main">
      <div className="sidenav-brand">
        <Logo size={19} />
        ClaudeLens
      </div>

      <div className="nav-group">
        {/* `end` so "/" isn't marked current on every nested route. */}
        <NavLink to="/" end className="nav-item">
          <span className="nav-icon">
            <Icon name="grid" />
          </span>
          <span className="nav-text">Overview</span>
        </NavLink>
        {/* Analytics has a per-person variant at /analytics/u/:author — both should light this up,
         * which NavLink does by prefix once `end` is omitted. */}
        <NavLink to="/analytics" end className="nav-item">
          <span className="nav-icon">
            <Icon name="chart" />
          </span>
          <span className="nav-text">Analytics</span>
        </NavLink>
        <NavLink to="/analytics/models" className="nav-item nav-item--sub">
          <span className="nav-icon">
            <Icon name="cpu" />
          </span>
          <span className="nav-text">Models</span>
        </NavLink>
      </div>

      {people.length > 0 && (
        <div className="nav-group nav-group--people">
          <div className="nav-label" id="nav-people">
            Team
          </div>
          <ul aria-labelledby="nav-people" className="nav-list">
            {people.map((a) => {
              const to = `/u/${encodeURIComponent(a.author)}`;
              // Mark the person current for their project + session pages too, not just /u/:author.
              const current = pathname.startsWith(to);
              return (
                <li key={a.author}>
                  <NavLink to={to} className="nav-item" aria-current={current ? 'page' : undefined}>
                    <span className="nav-avatar" aria-hidden>
                      {a.author.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="nav-text">{a.label}</span>
                    <span className="nav-count">{a.sessions}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="sidenav-foot">
        <p className="muted">
          Sessions sync automatically on every turn. Opt a session out with{' '}
          <code>/claudelens:untrack</code>.
        </p>
      </div>
    </nav>
  );
}
