import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
