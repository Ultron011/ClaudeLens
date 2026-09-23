// Shared chrome for the three Insights pages: the scope hook (person / project / date range, all
// URL-backed), the page-to-page tab strip, the filter bar, the coverage notice and the CSS bar.
import type { ReactNode } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { Icon } from '../Icon.js';
import { INSIGHT_PAGES } from './nav.js';
import { DateRangePicker } from '../DateRangePicker.js';
import { useOrgStats } from '../AppLayout.js';
import { useDateRange, RANGE_PRESETS } from '../../usePref.js';
import { fmtDay } from '../../format.js';
import type { InsightScope } from '../../api.insights.js';


/** Person + project + date range for an Insights page. Person and project live in the URL
 *  (`?person=`, `?project=`) so a filtered view is shareable; the range is the app-wide one. */
export function useInsightScope() {
  const [params, setParams] = useSearchParams();
  const dr = useDateRange();
  const person = params.get('person') ?? '';
  const project = params.get('project') ?? '';

  // Functional update: the search box applies on a debounce timer, and must not clobber a filter
  // changed in the meantime with the params it captured when typing started.
  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const scope: InsightScope = {
    identity: person || undefined,
    project: project || undefined,
    from: dr.from.toISOString(),
    to: dr.to.toISOString(),
  };
  const rangeLabel =
    dr.range === 'custom' && dr.customFrom && dr.customTo
      ? `${fmtDay(dr.customFrom)} – ${fmtDay(dr.customTo)}`
      : `the last ${RANGE_PRESETS[dr.range] ?? 30} days`;
  /** Changes whenever the scope does — use as the useFetch dep. */
  const scopeKey = [person, project, dr.range, dr.customFrom, dr.customTo].join('|');

  const rangePicker = (
    <DateRangePicker range={dr.range} customFrom={dr.customFrom} customTo={dr.customTo} onApply={dr.apply} />
  );
  return { params, person, project, setParam, scope, scopeKey, rangeLabel, rangePicker };
}

/** Tab strip between the three Insights pages. Carries the current person/project along. */
export function InsightsTabs() {
  const [params] = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ['person', 'project']) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const suffix = keep.toString() ? `?${keep}` : '';
  return (
    <nav className="ins-tabs" aria-label="Insights">
      {INSIGHT_PAGES.map((p) => (
        <NavLink key={p.to} to={p.to + suffix} className="ins-tab">
          <Icon name={p.icon} size={13} />
          {p.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Person (+ optional project) selects, then any page-specific controls. */
export function ScopeFilters({
  person,
  project,
  projects,
  setParam,
  children,
}: {
  person: string;
  project: string;
  /** Omit to hide the project select. */
  projects?: string[];
  setParam: (key: string, value: string | null) => void;
  children?: ReactNode;
}) {
  const { stats } = useOrgStats();
  const authors = stats?.authors ?? [];
  // Keep a selected value visible even when the option lists haven't loaded (or no longer hold it).
  // People are `author`s, as on /search and /u/:author (several people can share one account
  // email, so the email is not a person key). The server's identity filter matches author too.
  const personKnown = !person || authors.some((a) => a.author === person);
  const projectList = projects && project && !projects.includes(project) ? [project, ...projects] : projects;
  return (
    <div className="filter-bar" role="group" aria-label="Filters">
      <label className="filter">
        <span>Person</span>
        <select value={person} onChange={(e) => setParam('person', e.target.value || null)}>
          <option value="">Everyone</option>
          {!personKnown && <option value={person}>{person}</option>}
          {authors.map((a) => (
            <option key={a.author} value={a.author}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      {projectList && (
        <label className="filter">
          <span>Project</span>
          <select value={project} onChange={(e) => setParam('project', e.target.value || null)}>
            <option value="">All projects</option>
            {projectList.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      )}
      {children}
    </div>
  );
}

/** Honest "what this is based on" line. */
export function Coverage({ children }: { children: ReactNode }) {
  return (
    <p className="ins-coverage">
      <Icon name="layers" size={13} />
      <span>{children}</span>
    </p>
  );
}

export const pct = (n: number, d: number, digits = 0) =>
  d > 0 ? `${((n / d) * 100).toFixed(digits)}%` : '—';

/** A thin CSS bar; `tone` picks the fill colour. */
export function Bar({ value, max, tone = 'accent' }: { value: number; max: number; tone?: 'accent' | 'danger' | 'warn' | 'muted' }) {
  const w = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span className={`ins-bar ins-bar--${tone}`} aria-hidden>
      <span style={{ width: `${(w * 100).toFixed(1)}%` }} />
    </span>
  );
}

export function ErrorState({ title, err }: { title: string; err: string }) {
  return (
    <div className="empty">
      <Icon name="cpu" size={22} className="empty-icon" />
      <h3>{title}</h3>
      <p className="muted">{err}</p>
    </div>
  );
}

