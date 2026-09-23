import { getFilesTouched, type FilesTouched } from '../../api.trends.js';
import { useFetch } from '../../useFetch.js';
import '../../styles.trends.css';

/** "Files touched most" for one project, from stats.files (parser v9+). Ranked by edits + writes,
 *  then reads. Rows synced before v9 have no file data — the empty state says so instead of
 *  implying nothing was touched. */
export function FilesPanel({ author, project, from, to }: { author: string; project: string; from: string; to: string }) {
  const { data, err } = useFetch<FilesTouched>(
    (signal) => getFilesTouched({ author, project, from, to, limit: 12 }, signal),
    [author, project, from, to],
  );
  const max = Math.max(1, ...(data?.files ?? []).map((f) => f.edits + f.writes + f.reads));
  return (
    <section className="panel">
      <div className="panel-head tight">
        <h4>Files touched most</h4>
      </div>
      {err && !data ? (
        <p className="muted">Couldn’t load files: {err}</p>
      ) : !data ? (
        <div className="skel" style={{ height: 120, borderRadius: 'var(--r-md)' }} />
      ) : data.files.length === 0 ? (
        <p className="muted">
          {data.coverage.sessions === 0
            ? 'No sessions in this range.'
            : 'No file data yet — sessions record the files they read and edit once they re-sync with parser v9.'}
        </p>
      ) : (
        <>
          <ul className="barlist files-list">
            {data.files.map((f) => {
              const name = f.path.split(/[\\/]/).pop() || f.path;
              return (
                <li key={f.path} title={`${f.path}\n${f.edits} edits · ${f.writes} writes · ${f.reads} reads · ${f.sessions} sessions`}>
                  <span className="bar-label tool">{name}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${((f.edits + f.writes + f.reads) / max) * 100}%` }} />
                  </span>
                  <span className="bar-count">{f.edits + f.writes}</span>
                </li>
              );
            })}
          </ul>
          <p className="trend-note">
            Count = edits + writes; hover for reads. From {data.coverage.covered} of {data.coverage.sessions} sessions (v9+).
          </p>
        </>
      )}
    </section>
  );
}
