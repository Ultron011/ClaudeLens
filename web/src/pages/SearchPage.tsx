import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SessionSummary } from '@claudelens/shared';
import { deleteSession } from '../api.js';
import { Shell } from '../components/Shell.js';
import { Icon } from '../components/Icon.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { ViewToggle } from '../components/ViewToggle.js';
import { SessionList } from '../components/SessionList.js';
import { useOrgStats } from '../components/AppLayout.js';
import { useLayoutPref } from '../usePref.js';
import { usePagedSessions } from '../usePagedSessions.js';

const SORTS = [
  { value: 'recent', label: 'Newest' },
  { value: 'cost', label: 'Cost' },
  { value: 'messages', label: 'Messages' },
  { value: 'tokens', label: 'Tokens' },
];

/** /search — every session across the team, filterable. All state lives in the URL so a filtered
 *  view is a shareable link (the rail's "Featured" item is just `?featured=true`). */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [layout, setLayout] = useLayoutPref();
  const { stats } = useOrgStats();

  const q = params.get('q') ?? '';
  const inTranscript = params.get('in') === 'transcript';
  const author = params.get('author') ?? '';
  const featured = params.get('featured') === 'true';
  const includeHidden = params.get('hidden') === 'true';
  const sort = params.get('sort') ?? 'recent';

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const query = {
    q: q || undefined,
    inTranscript: (q && inTranscript) || undefined,
    author: author || undefined,
    featured: featured || undefined,
    includeHidden: includeHidden || undefined,
    sort,
  };
  const list = usePagedSessions(query, JSON.stringify(query));
  const [pending, setPending] = useState<SessionSummary | null>(null);

  const title = featured ? 'Featured sessions' : q ? `Search: ${q}` : 'All sessions';

  return (
    <Shell crumbs={[{ label: title }]}>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="entity-sub">
            {q
              ? inTranscript
                ? 'Matching title, note, person, project or words anywhere in the transcript.'
                : 'Matching title, note, person or project.'
              : 'Every session across the team.'}
          </p>
        </div>
        <div className="page-head-actions">
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

      <div className="filter-bar" role="group" aria-label="Filters">
        <label className="filter">
          <span>Person</span>
          <select value={author} onChange={(e) => set('author', e.target.value || null)}>
            <option value="">Everyone</option>
            {(stats?.authors ?? []).map((a) => (
              <option key={a.author} value={a.author}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>Sort</span>
          <select value={sort.replace(/_asc$/, '')} onChange={(e) => set('sort', e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={inTranscript ? 'chip on' : 'chip'}
          aria-pressed={inTranscript}
          onClick={() => set('in', inTranscript ? null : 'transcript')}
          title="Also match whole words inside transcripts"
        >
          <Icon name="message" size={13} />
          Search transcripts
        </button>
        <button
          type="button"
          className={featured ? 'chip on' : 'chip'}
          aria-pressed={featured}
          onClick={() => set('featured', featured ? null : 'true')}
        >
          <Icon name="star" size={13} filled={featured} />
          Featured only
        </button>
        <button
          type="button"
          className={includeHidden ? 'chip on' : 'chip'}
          aria-pressed={includeHidden}
          onClick={() => set('hidden', includeHidden ? null : 'true')}
        >
          <Icon name={includeHidden ? 'eye' : 'eyeOff'} size={13} />
          Show hidden
        </button>
      </div>

      {list.err ? (
        <div className="empty">
          <Icon name="cpu" size={22} className="empty-icon" />
          <h3>Search failed</h3>
          <p className="muted">{list.err}</p>
        </div>
      ) : !list.loaded ? (
        <div className="skel" style={{ height: 300, borderRadius: 'var(--r-lg)' }} />
      ) : list.sessions.length === 0 ? (
        <div className="empty">
          <Icon name="search" size={22} className="empty-icon" />
          <h3>No matching sessions</h3>
          <p className="muted">
            {q && !inTranscript
              ? 'Try “Search transcripts” to look inside the conversations too.'
              : 'Try a different word or clear a filter.'}
          </p>
        </div>
      ) : (
        <>
          <SessionList
            sessions={list.sessions}
            layout={layout}
            showProject
            onDelete={(s) => setPending(s)}
            serverSort={{ value: sort, onChange: (v) => set('sort', v) }}
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

      <ConfirmDialog
        open={!!pending}
        title="Delete this session?"
        body={<>“{pending?.title}” will be permanently deleted.</>}
        onConfirm={async () => {
          if (!pending) return;
          await deleteSession(pending.id);
          list.remove(pending.id);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </Shell>
  );
}
