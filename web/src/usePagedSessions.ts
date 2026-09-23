import { useEffect, useState } from 'react';
import type { SessionSummary } from '@claudelens/shared';
import { listSessions, type ListSessionsParams } from './api.js';

/** Paginated GET /api/sessions with "Load more".
 *
 * `key` identifies the query: whenever it changes the list resets to page one and any in-flight
 * page is aborted, so a range/filter switch mid-load can never append rows from the old query
 * (the bug the hand-rolled versions had). */
export function usePagedSessions(params: ListSessionsParams, key: string, pageSize = 50) {
  const [state, setState] = useState<{
    key: string;
    sessions: SessionSummary[];
    offset: number;
    done: boolean;
    loaded: boolean;
    err: string;
  }>({ key, sessions: [], offset: 0, done: false, loaded: false, err: '' });
  const [loading, setLoading] = useState(false);

  // Reset synchronously on a new query so stale rows never render under the new filters.
  const current = state.key === key ? state : { key, sessions: [], offset: 0, done: false, loaded: false, err: '' };
  if (current !== state) setState(current);
  const offset = current.offset;

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    listSessions({ ...params, limit: pageSize, offset }, ac.signal)
      .then((rows) => {
        if (ac.signal.aborted) return;
        setState((s) =>
          s.key !== key
            ? s
            : {
                ...s,
                sessions: offset === 0 ? rows : [...s.sessions, ...rows],
                done: rows.length < pageSize,
                loaded: true,
                err: '',
              },
        );
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setState((s) => (s.key !== key ? s : { ...s, loaded: true, err: e instanceof Error ? e.message : String(e) }));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
    // params are captured by `key`; listing them would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, offset, pageSize]);

  return {
    sessions: current.sessions,
    done: current.done,
    loaded: current.loaded,
    err: current.err,
    loading,
    loadMore: () => setState((s) => ({ ...s, offset: s.offset + pageSize })),
    /** Drop a row locally after a delete/hide, without refetching. */
    remove: (id: string) => setState((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) })),
    /** Replace a row locally after a PATCH. */
    update: (row: SessionSummary) =>
      setState((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === row.id ? row : x)) })),
  };
}
