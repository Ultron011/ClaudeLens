import { createContext, useContext, useEffect, useRef, useState } from 'react';
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
      {/* Phone-only. Always in the DOM (CSS hides it above 720px) so there is no media-query
       * round-trip in JS deciding which navigation exists. */}
      <MobileNav stats={stats} />
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

/** Phone navigation (≤720px), where the desktop rail is hidden.
 *
 * The rail's tablet fallback — a horizontally scrolling strip — does not survive a 390px
 * viewport: it cut off after "Analytics", leaving Models and every teammate off-screen behind a
 * swipe with no affordance, and it scrolled away with the page so nothing was reachable from
 * halfway down a table. This is a fixed bottom tab bar instead: the three routes stay visible at
 * every scroll position, and Team opens a sheet listing everyone, so any person is one tap away
 * from any page. That drill path — team totals → one person → their projects — is the product's
 * whole purpose, and it was the thing narrow viewports had lost.
 *
 * `end` on Overview and Analytics mirrors SideNav: without it "/" matches every nested route, and
 * "/analytics" would light up on "/analytics/models" alongside Models itself. */
function MobileNav({ stats }: { stats: OrgStats | null }) {
  const people = stats?.authors ?? [];
  const { pathname } = useLocation();
  const [teamOpen, setTeamOpen] = useState(false);
  const teamBtn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  // Any navigation dismisses the sheet — tapping a person should land you on their page, not
  // leave the sheet covering it.
  useEffect(() => setTeamOpen(false), [pathname]);

  useEffect(() => {
    if (!teamOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTeamOpen(false);
        teamBtn.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    // The sheet is its own scroll region; locking the page underneath stops the body from
    // scrolling behind it when the list is flicked past its end.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [teamOpen]);

  return (
    <>
      {/* Mounted only while open — the slide-up is a CSS keyframe on mount rather than a
       * transition on a permanently-mounted, translated-off-screen panel. That version needs
       * `inert` to keep a dozen off-screen links out of the tab order, which React 18 does not
       * type; unmounting gets the same result with no escape hatch. */}
      {teamOpen && (
        <>
          <div className="mnav-scrim" onClick={() => setTeamOpen(false)} aria-hidden />
          <div className="mnav-sheet" ref={sheet} role="dialog" aria-modal="true" aria-label="Team">
            <div className="mnav-sheet-head">
              <h2>Team</h2>
              <button
                type="button"
                className="chip icon"
                onClick={() => {
                  setTeamOpen(false);
                  teamBtn.current?.focus();
                }}
                aria-label="Close team list"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            {people.length === 0 ? (
              <p className="muted" style={{ padding: 'var(--s4) 0' }}>
                No one has synced a session yet.
              </p>
            ) : (
              <ul className="mnav-people">
                {people.map((a) => {
                  const to = `/u/${encodeURIComponent(a.author)}`;
                  return (
                    <li key={a.author}>
                      <NavLink
                        to={to}
                        className="mnav-person"
                        aria-current={pathname.startsWith(to) ? 'page' : undefined}
                      >
                        <span className="nav-avatar" aria-hidden>
                          {a.author.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="mnav-person-name">{a.label}</span>
                        <span className="mnav-person-count">
                          {a.sessions} {a.sessions === 1 ? 'session' : 'sessions'}
                        </span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      <nav className="mnav" aria-label="Primary">
        <NavLink to="/" end className="mnav-item">
          <Icon name="grid" />
          <span>Overview</span>
        </NavLink>
        <NavLink to="/analytics" end className="mnav-item">
          <Icon name="chart" />
          <span>Analytics</span>
        </NavLink>
        <NavLink to="/analytics/models" className="mnav-item">
          <Icon name="cpu" />
          <span>Models</span>
        </NavLink>
        <button
          type="button"
          ref={teamBtn}
          className={teamOpen ? 'mnav-item is-open' : 'mnav-item'}
          aria-expanded={teamOpen}
          onClick={() => setTeamOpen((o) => !o)}
        >
          <Icon name="people" />
          <span>Team</span>
        </button>
      </nav>
    </>
  );
}
