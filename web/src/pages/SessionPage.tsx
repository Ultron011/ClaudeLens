import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Turn } from '@claudelens/shared';
import { getSession, patchSession, type SessionDetail } from '../api.js';
import { fmtDuration, fmtTokens } from '../format.js';
import { Shell, type Crumb } from '../components/Shell.js';

export function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<SessionDetail | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id) return;
    getSession(id).then(setS).catch((e) => setErr(String(e)));
  }, [id]);

  async function toggleFeatured() {
    if (!s) return;
    const u = await patchSession(s.id, { featured: !s.featured });
    setS({ ...s, featured: u.featured });
  }
  async function toggleHidden() {
    if (!s) return;
    const u = await patchSession(s.id, { hidden: !s.hidden });
    setS({ ...s, hidden: u.hidden });
  }

  if (err)
    return (
      <Shell>
        <div className="empty">
          <h3>Couldn’t load session</h3>
          <p className="muted">{err}</p>
        </div>
      </Shell>
    );
  if (!s)
    return (
      <Shell>
        <div className="empty">Loading…</div>
      </Shell>
    );

  const st = s.stats;
  const crumbs: Crumb[] = [
    { label: s.author, to: `/u/${encodeURIComponent(s.author)}` },
  ];
  if (s.project)
    crumbs.push({
      label: s.project,
      to: `/u/${encodeURIComponent(s.author)}/${encodeURIComponent(s.project)}`,
    });
  crumbs.push({ label: s.title });

  return (
    <Shell
      crumbs={crumbs}
      actions={
        <>
          <button className={s.featured ? 'chip on' : 'chip'} onClick={toggleFeatured}>
            ★ {s.featured ? 'Featured' : 'Feature'}
          </button>
          <button className={s.hidden ? 'chip danger on' : 'chip danger'} onClick={toggleHidden}>
            {s.hidden ? 'Hidden — restore' : 'Hide'}
          </button>
        </>
      }
    >
      <div className="session-wrap">
        {s.hidden && (
          <div className="notice">
            This session is <strong>hidden</strong> from the gallery and team stats. It still
            re-syncs but stays hidden until restored.
          </div>
        )}
        <div className="session-header">
          <h1>{s.title}</h1>
          <div className="session-sub">
            by <strong>{s.author}</strong>
            {s.project && <> · {s.project}</>}
            {s.gitBranch && (
              <>
                {' '}
                · <code>{s.gitBranch}</code>
              </>
            )}
          </div>
          {s.note && <blockquote className="why">{s.note}</blockquote>}

          <div className="session-stats">
            <Metric label="turns" value={String(st.turns)} accent />
            <Metric label="tokens" value={fmtTokens(st.totalTokens)} />
            <Metric label="cache read" value={fmtTokens(st.cacheReadTokens)} />
            {st.durationMs ? <Metric label="duration" value={fmtDuration(st.durationMs)} /> : null}
            <Metric label="models" value={st.models.join(', ') || '—'} />
          </div>

          {(st.skills.length > 0 || st.subagents.length > 0) && (
            <div className="session-pills">
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
          {Object.keys(st.toolUsage).length > 0 && (
            <div className="session-pills">
              {Object.entries(st.toolUsage)
                .sort((a, b) => b[1] - a[1])
                .map(([t, n]) => (
                  <span key={t} className="pill tool">
                    {t} <span className="tag-count">{n}</span>
                  </span>
                ))}
            </div>
          )}
        </div>

        <div className="transcript">
          {s.turns.map((t, i) => (
            <TurnView key={i} turn={t} />
          ))}
        </div>
      </div>
    </Shell>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="metric">
      <div className={accent ? 'metric-value accent' : 'metric-value'}>{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const [showThinking, setShowThinking] = useState(false);
  const isUser = turn.role === 'user';
  return (
    <div className={`turn ${isUser ? 'user' : 'assistant'}${turn.isSidechain ? ' sidechain' : ''}`}>
      <div className="turn-role">
        {isUser ? 'User' : 'Claude'}
        {turn.isSidechain && <span className="badge">subagent</span>}
      </div>
      <div className="turn-body">
        {turn.thinking && (
          <div className="thinking">
            <button className="thinking-toggle" onClick={() => setShowThinking((v) => !v)}>
              {showThinking ? '▾' : '▸'} thinking
            </button>
            {showThinking && <pre className="thinking-text">{turn.thinking}</pre>}
          </div>
        )}
        {turn.text && <div className="turn-text">{turn.text}</div>}
        {turn.toolCalls.length > 0 && (
          <div className="tool-calls">
            {turn.toolCalls.map((tc, i) => (
              <span key={i} className="tool-call">
                <span className="tc-name">{tc.name}</span>
                {tc.detail && <span className="tc-detail">{tc.detail}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
