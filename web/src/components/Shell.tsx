import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

/** App shell: sticky top bar with brand + optional breadcrumb trail + actions. */
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
    <div className="app">
      <header className="topbar">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/" className="brand">
            <span className="logo" aria-hidden>
              ◑
            </span>
            ClaudeLens
          </Link>
          {crumbs.map((c, i) => (
            <span className="crumb" key={i}>
              <span className="crumb-sep" aria-hidden>
                /
              </span>
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </span>
          ))}
          {crumbs.length === 0 && tagline && <span className="tagline">{tagline}</span>}
        </nav>
        {actions && <div className="topbar-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
