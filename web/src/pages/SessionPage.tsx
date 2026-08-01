import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Turn, ToolCall } from '@claudelens/shared';
import { getSession, patchSession, deleteSession, type SessionDetail } from '../api.js';
import { fmtDuration, fmtTokens, fmtCost, msgCount } from '../format.js';
import { Shell, type Crumb } from '../components/Shell.js';
import { Metric } from '../components/Stat.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { AccountLine } from '../components/AccountLine.js';
import { ModeBadges, TurnModeBadge, modalMode } from '../components/ModeBadges.js';
import { useFetch } from '../useFetch.js';

export function SessionPage() {
  const { id = '' } = useParams<{ id: string }>();
  const {
    data: s,
    err,
    refetch,
  } = useFetch<SessionDetail>((signal) => getSession(id, signal), [id]);
  const [pendingDelete, setPendingDelete] = useState(false);
  const nav = useNavigate();

  async function toggleFeatured() {
    if (!s) return;
    await patchSession(s.id, { featured: !s.featured });
    refetch();
  }
  async function confirmDelete() {
    if (!s) return;
    await deleteSession(s.id);
    setPendingDelete(false);
    nav(
      s.project
        ? `/u/${encodeURIComponent(s.author)}/${encodeURIComponent(s.project)}`
        : `/u/${encodeURIComponent(s.author)}`,
      { replace: true },
    );
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
  const modal = modalMode(s.turns);
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
          <button className="chip danger" onClick={() => setPendingDelete(true)}>
            Delete
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
            <AccountLine email={s.accountEmail} orgName={s.orgName} />
          </div>
          {s.note && <blockquote className="why">{s.note}</blockquote>}

          <div className="session-stats">
            <Metric
              label="messages"
              value={String(msgCount(st))}
              accent
              title={`${st.turns} Claude turns`}
            />
            <Metric label="tokens" value={fmtTokens(st.totalTokens)} />
            <Metric label="cache read" value={fmtTokens(st.cacheReadTokens)} />
            {st.durationMs ? <Metric label="duration" value={fmtDuration(st.durationMs)} /> : null}
            <Metric label="cost" value={fmtCost(st.estimatedCostUsd)} />
            <Metric label="models" value={st.models.join(', ') || '—'} />
          </div>
          <ModeBadges modes={st.permissionModes} usedAutoMode={st.usedAutoMode} />

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
            <TurnView key={i} turn={t} modal={modal} />
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete}
        title="Delete this session?"
        body={<>“{s.title}” will be permanently deleted. This cannot be undone.</>}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(false)}
      />
    </Shell>
  );
}

function TurnView({ turn, modal }: { turn: Turn; modal?: Turn['permissionMode'] }) {
  const [showThinking, setShowThinking] = useState(false);
  const isUser = turn.role === 'user';
  return (
    <div className={`turn ${isUser ? 'user' : 'assistant'}${turn.isSidechain ? ' sidechain' : ''}`}>
      <div className="turn-role">
        {isUser ? 'User' : 'Claude'}
        {turn.isSidechain && <span className="badge">subagent</span>}
        <TurnModeBadge mode={turn.permissionMode} modal={modal} />
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
              <ToolCallRow key={i} tc={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallRow({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="tool-call">
      <span className="tc-name">{tc.name}</span>
      {tc.detail && <span className="tc-detail">{tc.detail}</span>}
      {tc.args && (
        <button
          type="button"
          className={`tc-args${expanded ? ' expanded' : ''}`}
          title={tc.args}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse command' : 'Expand command'}
          onClick={() => setExpanded((v) => !v)}
        >
          {tc.args}
        </button>
      )}
    </div>
  );
}
