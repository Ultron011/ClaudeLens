import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { SessionSummary } from '@claudelens/shared';
import { deleteProject, deleteSession, getAnalytics, getProjects } from '../api.js';
import { fmtTokens, fmtCost } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Kpi, KpiSkeleton } from '../components/Kpi.js';
import { Icon } from '../components/Icon.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { ViewToggle } from '../components/ViewToggle.js';
import { SessionList } from '../components/SessionList.js';
import { DateRangePicker } from '../components/DateRangePicker.js';
import { useDateRange, useLayoutPref } from '../usePref.js';
import { useFetch } from '../useFetch.js';
import { usePagedSessions } from '../usePagedSessions.js';
import { FilesPanel } from '../components/trends/FilesPanel.js';

export function ProjectPage() {
  const { author = '', project = '' } = useParams<{ author: string; project: string }>();
  const nav = useNavigate();
  const { search } = useLocation();
  // One shared `layout` key across Overview, User and Project — `usePref` stores it under a
  // single localStorage entry, so differing defaults per page meant whichever page you touched
  // last silently changed the others. `useLayoutPref` centralises that default (table on a wide
  // screen, cards on a phone) so all three stay in step.
  const [layout, setLayout] = useLayoutPref();
  // Same range as the User page it was reached from (the link carries ?range=…), so "5 sessions"
  // there doesn't become 40 here after one click.
  const { range, from, to, customFrom, customTo, apply } = useDateRange();
  const [params, setParams] = useSearchParams();
  const includeHidden = params.get('hidden') === 'true';
  const sort = params.get('sort') ?? 'recent';
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const query = { author, project, from: fromIso, to: toIso, includeHidden: includeHidden || undefined, sort };
  const list = usePagedSessions(query, JSON.stringify(query));

  // Totals and side panels are aggregated server-side over the whole project + range — they used
  // to be summed over whichever page of sessions happened to be loaded.
  const { data: rollup } = useFetch(
    (signal) => getProjects(author, fromIso, toIso, signal),
    [author, fromIso, toIso],
  );
  const { data: analytics } = useFetch(
    (signal) => getAnalytics(author, fromIso, toIso, signal, { project, limit: 1 }),
    [author, project, fromIso, toIso],
  );
  const row = rollup?.projects.find((p) => p.project === project);
  const models = analytics?.models ?? [];
  const maxModel = Math.max(1, ...models.map((m) => m.sessions));

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
    list.remove(pendingSession.id);
    setPendingSession(null);
  }

  return (
    <Shell
      crumbs={[{ label: author, to: `/u/${encodeURIComponent(author)}${search}` }, { label: project }]}
      actions={
        <>
          <DateRangePicker range={range} customFrom={customFrom} customTo={customTo} onApply={apply} />
          {list.sessions.length > 0 && (
            <button className="chip danger" onClick={() => setDeleteProjectOpen(true)}>
              <Icon name="trash" size={13} />
              Delete project
            </button>
          )}
        </>
      }
    >
      <div className="page-head">
        <div className="entity-head">
          <span className="folder-badge avatar-lg" aria-hidden>
            <Icon name="folder" size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h1 className="mono">{project}</h1>
            <p className="entity-sub">
              by <Link to={`/u/${encodeURIComponent(author)}`}>{author}</Link>
            </p>
          </div>
        </div>
        <div className="page-head-actions">
          <button
            type="button"
            className={includeHidden ? 'chip on' : 'chip'}
            aria-pressed={includeHidden}
            onClick={() => setParam('hidden', includeHidden ? null : 'true')}
          >
            <Icon name={includeHidden ? 'eye' : 'eyeOff'} size={13} />
            Show hidden
          </button>
          <ViewToggle
            label="Layout"
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'table', label: 'Table' },
              { value: 'cards', label: 'Cards' },
            ]}
          />
        </div>
      </div>

      <div className="kpi-row">
        {!rollup ? (
          <>
            <KpiSkeleton label="Sessions" />
            <KpiSkeleton label="Messages" />
            <KpiSkeleton label="Tokens" />
            <KpiSkeleton label="Cost" />
          </>
        ) : (
          <>
            <Kpi label="Sessions" icon="message" value={String(row?.sessions ?? 0)} foot="in this range" primary />
            <Kpi
              label="Messages"
              icon="person"
              value={(row?.messages ?? 0).toLocaleString()}
              foot={`${(row?.turns ?? 0).toLocaleString()} Claude turns back`}
            />
            <Kpi label="Tokens" icon="layers" value={fmtTokens(row?.tokens ?? 0)} foot="input + output + cache" />
            <Kpi label="Cost" icon="coin" value={fmtCost(row?.cost)} foot="estimated from tokens" />
          </>
        )}
      </div>

      {/* Same bento as UserPage — sessions in the wide cell, a narrow stack of what the project
       * exercised beside it. Before this, Project was the one page with no bento: a bare
       * auto-fill card grid that sharded two sessions across four tracks and left the rest of
       * the viewport empty. */}
      <div className="bento">
        <section className="col-9">
          <div className="panel-head">
            <div>
              <h4>Sessions</h4>
              <p className="panel-sub">Every session {author} ran in this project in the selected range.</p>
            </div>
          </div>

          {list.err ? (
            <div className="empty">
              <Icon name="cpu" size={22} className="empty-icon" />
              <h3>Can’t reach the server</h3>
              <p className="muted">{list.err}</p>
            </div>
          ) : !list.loaded ? (
            <div className="skel" style={{ height: 300, borderRadius: 'var(--r-lg)' }} />
          ) : list.sessions.length === 0 ? (
            <div className="empty">
              <Icon name="message" size={22} className="empty-icon" />
              <h3>No sessions in this range</h3>
              <p>
                Try a wider date range. If there are none at all, the project may have been opted
                out with <code>/claudelens:untrack-project</code>.
              </p>
            </div>
          ) : (
            <>
              <SessionList
                sessions={list.sessions}
                layout={layout}
                onDelete={(s) => setPendingSession(s)}
                serverSort={{ value: sort, onChange: (v) => setParam('sort', v) }}
              />
              {!list.done && (
                <div className="load-more">
                  <button type="button" className="chip" disabled={list.loading} onClick={list.loadMore}>
                    {list.loading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <div className="col-3 stack">
          <section className="panel">
            <div className="panel-head tight">
              <h4>Skills used here</h4>
            </div>
            {!row?.skills.length ? (
              <p className="muted">No skills in these sessions.</p>
            ) : (
              <div className="card-skills">
                {row.skills.map((sk) => (
                  <span key={sk} className="pill skill">
                    /{sk}
                  </span>
                ))}
              </div>
            )}
          </section>

          <FilesPanel author={author} project={project} from={fromIso} to={toIso} />

          <section className="panel">
            <div className="panel-head tight">
              <h4>Models</h4>
            </div>
            {models.length === 0 ? (
              <p className="muted">No model usage recorded.</p>
            ) : (
              <ul className="barlist">
                {models.map((m) => (
                  <li key={m.model} title={`${fmtCost(m.cost)} · ${fmtTokens(m.tokens)} tokens`}>
                    <span className="bar-label tool">{m.model}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${(m.sessions / maxModel) * 100}%` }} />
                    </span>
                    <span className="bar-count">{m.sessions}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={deleteProjectOpen}
        title={`Delete project “${project}”?`}
        body={
          <>
            This permanently deletes every session in “{project}” by {author} — across all dates,
            not just the selected range. This cannot be undone.
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