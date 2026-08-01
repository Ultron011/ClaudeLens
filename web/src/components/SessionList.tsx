import { Link } from 'react-router-dom';
import type { SessionSummary } from '@claudelens/shared';
import { fmtDate, fmtTokens, fmtCost, msgCount } from '../format.js';
import { Stat } from './Stat.js';
import { DataTable, type Column } from './DataTable.js';

export interface SessionListProps {
  sessions: SessionSummary[];
  layout: 'cards' | 'table';
  onDelete: (s: SessionSummary) => void;
  /** Show the Project column/meta — only meaningful when the list spans projects. */
  showProject?: boolean;
}

/** Card-vs-table branch for a list of sessions, shared by ProjectPage and UserPage's flat view. */
export function SessionList({ sessions, layout, onDelete, showProject = false }: SessionListProps) {
  if (layout === 'table') {
    const columns: Column<SessionSummary>[] = [
      {
        key: 'title',
        header: 'Title',
        sortable: true,
        sortValue: (s) => s.title,
        render: (s) => <Link to={`/session/${s.id}`}>{s.title}</Link>,
      },
      ...(showProject
        ? [
            {
              key: 'project',
              header: 'Project',
              sortable: true,
              sortValue: (s: SessionSummary) => s.project ?? '',
              render: (s: SessionSummary) => (s.project ? <span className="mono">{s.project}</span> : '—'),
            } as Column<SessionSummary>,
          ]
        : []),
      {
        key: 'account',
        header: 'Account',
        sortable: true,
        sortValue: (s) => s.displayName ?? s.author,
        render: (s) => s.displayName ?? s.author,
      },
      {
        key: 'started',
        header: 'Started',
        sortable: true,
        sortValue: (s) => s.startedAt ?? s.createdAt,
        render: (s) => fmtDate(s.startedAt ?? s.createdAt),
      },
      {
        key: 'messages',
        header: 'Messages',
        numeric: true,
        sortable: true,
        sortValue: (s) => msgCount(s.stats),
        render: (s) => <span title={`${s.stats.turns} Claude turns`}>{msgCount(s.stats)}</span>,
      },
      {
        key: 'tokens',
        header: 'Tokens',
        numeric: true,
        sortable: true,
        sortValue: (s) => s.stats.totalTokens,
        render: (s) => fmtTokens(s.stats.totalTokens),
      },
      {
        key: 'cost',
        header: 'Cost',
        numeric: true,
        sortable: true,
        sortValue: (s) => s.stats.estimatedCostUsd ?? 0,
        render: (s) => fmtCost(s.stats.estimatedCostUsd),
      },
      { key: 'models', header: 'Models', render: (s) => s.stats.models.join(', ') || '—' },
      {
        key: 'mode',
        header: 'Mode',
        render: (s) => (s.usedAutoMode ? '⚡ auto' : s.permissionModes?.[0] ?? '—'),
      },
      {
        key: 'delete',
        header: <span className="sr-only">Delete</span>,
        render: (s) => (
          <button
            type="button"
            className="chip danger"
            aria-label={`Delete session ${s.title}`}
            onClick={() => onDelete(s)}
          >
            ⨯
          </button>
        ),
      },
    ];
    return (
      <DataTable columns={columns} rows={sessions} rowKey={(s) => s.id} caption="Sessions" ariaLabel="Sessions" />
    );
  }

  return (
    <div className="grid">
      {sessions.map((s) => (
        <SessionCard key={s.id} s={s} showProject={showProject} onDelete={() => onDelete(s)} />
      ))}
    </div>
  );
}

function SessionCard({
  s,
  showProject,
  onDelete,
}: {
  s: SessionSummary;
  showProject: boolean;
  onDelete: () => void;
}) {
  const st = s.stats;
  return (
    <article className="card">
      <Link className="card-link" aria-label={s.title} to={`/session/${s.id}`} />
      <div className="card-content">
        <div className="card-head">
          <h3 className="card-title">{s.title}</h3>
          {(s.hidden || s.featured) && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              {s.hidden && <span className="badge-hidden">hidden</span>}
              {s.featured && (
                <span className="star" title="Featured">
                  ★
                </span>
              )}
            </div>
          )}
        </div>
        {s.note && <p className="card-note">{s.note}</p>}
        <div className="card-meta">
          <span>{fmtDate(s.startedAt ?? s.createdAt)}</span>
          {showProject && s.project && (
            <>
              <span className="dot">·</span>
              <span className="mono">{s.project}</span>
            </>
          )}
          {s.gitBranch && (
            <>
              <span className="dot">·</span>
              <span className="mono">{s.gitBranch}</span>
            </>
          )}
        </div>
        <div className="card-stats">
          <Stat label="messages" value={String(msgCount(st))} accent title={`${st.turns} Claude turns`} />
          <Stat label="tokens" value={fmtTokens(st.totalTokens)} />
          <Stat label="cost" value={fmtCost(st.estimatedCostUsd)} />
        </div>
        {(st.skills.length > 0 || st.subagents.length > 0) && (
          <div className="card-skills">
            {st.skills.map((sk) => (
              <span key={sk} className="pill skill">
                /{sk}
              </span>
            ))}
            {st.subagents.map((a) => (
              <span key={a} className="pill agent">
                @{a}
              </span>
            ))}
          </div>
        )}
        {s.tags.length > 0 && (
          <div className="card-tags">
            {s.tags.map((t) => (
              <span key={t} className="tag mini">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="card-actions">
        <button type="button" className="chip danger" aria-label={`Delete session: ${s.title}`} onClick={onDelete}>
          ⨯
        </button>
      </div>
    </article>
  );
}
