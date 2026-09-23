import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Icon } from './Icon.js';
import { ThemeToggler } from './ThemeToggler.js';

export interface Crumb {
  label: string;
  to?: string;
}

/** Per-page chrome: the sticky breadcrumb bar plus the page container.
 *
 * The persistent left rail lives one level up in `AppLayout` (a layout route), so it is NOT
 * remounted per page — this component only owns what actually changes between routes. `tagline`
 * is the fallback line shown on the root page, where there are no crumbs to render. */
export function Shell({
  crumbs = [],
  tagline,
  actions,
  children,
}: {
  crumbs?: Crumb[];
  tagline?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  // Tab/history/bookmark title from the deepest crumb — every tab used to read "ClaudeLens".
  const last = crumbs.length ? crumbs[crumbs.length - 1].label : tagline;
  useEffect(() => {
    document.title = last ? `${last} · ClaudeLens` : 'ClaudeLens';
  }, [last]);

  return (
    <>
      <header className="topbar">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/" className="crumb-home" aria-label="Overview">
            <Icon name="home" />
          </Link>
          {crumbs.map((c, i) => (
            <span className="crumb" key={i}>
              <span className="crumb-sep" aria-hidden>
                /
              </span>
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </span>
          ))}
          {crumbs.length === 0 && tagline && (
            <span className="crumb">
              <span className="crumb-sep" aria-hidden>
                /
              </span>
              <span aria-current="page">{tagline}</span>
            </span>
          )}
        </nav>
        <div className="topbar-actions">
          <TopbarSearch />
          {actions}
          <ThemeToggler />
        </div>
      </header>
      <main className="page" id="main">
        {children}
      </main>
    </>
  );
}

/** Global session search → /search?q=. Pre-filled when already on the search page. */
function TopbarSearch() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onSearch = pathname === '/search';
  const [q, setQ] = useState(onSearch ? (params.get('q') ?? '') : '');
  useEffect(() => {
    if (onSearch) setQ(params.get('q') ?? '');
  }, [onSearch, params]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(onSearch ? params : undefined);
    if (q.trim()) next.set('q', q.trim());
    else next.delete('q');
    nav(`/search?${next}`);
  }
  return (
    <form className="topbar-search" role="search" onSubmit={submit}>
      <Icon name="search" size={13} />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search sessions…"
        aria-label="Search sessions"
      />
    </form>
  );
}
