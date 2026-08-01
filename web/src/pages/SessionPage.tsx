import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Turn, ToolCall } from '@claudelens/shared';
import { getSession, patchSession, deleteSession, type SessionDetail } from '../api.js';
import { fmtDuration, fmtTokens, fmtCost, msgCount } from '../format.js';
import { Shell, type Crumb } from '../components/Shell.js';
import { Metric } from '../components/Stat.js';
import { Icon } from '../components/Icon.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { AccountLine } from '../components/AccountLine.js';
import { TurnModeBadge, modalMode } from '../components/ModeBadges.js';
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
      <Shell crumbs={[{ label: 'Session' }]}>
        <div className="empty">
          <Icon name="cpu" size={22} className="empty-icon" />
          <h3>Couldn’t load this session</h3>
          <p className="muted">{err}</p>
        </div>
      </Shell>
    );
  if (!s)
    return (
      <Shell crumbs={[{ label: 'Session' }]}>
        <div className="session-wrap" aria-busy="true">
          <div className="skel skel-line" style={{ width: '55%', height: 22 }} />
          <div className="skel skel-line" style={{ width: '30%', marginTop: 12 }} />
          <div className="skel" style={{ height: 76, borderRadius: 'var(--r-lg)', marginTop: 20 }} />
          <div className="skel" style={{ height: 300, borderRadius: 'var(--r-lg)', marginTop: 20 }} />
        </div>
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
          <button
            className={s.featured ? 'chip on' : 'chip'}
            onClick={toggleFeatured}
            aria-pressed={s.featured}
          >
            <Icon name="star" size={13} filled={s.featured} />
            {s.featured ? 'Featured' : 'Feature'}
          </button>
          <button className="chip danger" onClick={() => setPendingDelete(true)}>
            <Icon name="trash" size={13} />
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
                ·{' '}
                <span className="inline-icon">
                  <Icon name="branch" size={12} />
                  <code>{s.gitBranch}</code>
                </span>
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
          {/* One labelled block per kind, on a single spacing rhythm. Previously these were three
            * bare pill rows with different gaps stacked under the stats, which read as ragged and
            * left the reader to guess what each row was. A row is omitted entirely when empty
            * rather than rendering an orphan label. */}
          <dl className="session-facts">
            {(st.skills.length > 0 || st.subagents.length > 0) && (
              <div className="session-fact">
                <dt>Skills &amp; subagents</dt>
                <dd>
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
                </dd>
              </div>
            )}
            {Object.keys(st.toolUsage).length > 0 && (
              <div className="session-fact">
                <dt>Tools</dt>
                <dd>
                  {Object.entries(st.toolUsage)
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, n]) => (
                      <span key={t} className="pill">
                        {t} <span className="tag-count">{n}</span>
                      </span>
                    ))}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="transcript">
          {s.turns.map((t, i) => (
            <TurnView
              key={i}
              turn={t}
              modal={modal}
              prevMode={i > 0 ? s.turns[i - 1].permissionMode : undefined}
              author={s.author}
            />
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

/** One transcript turn.
 *
 * The speaker is named in a header row — avatar chip + name — rather than in a narrow uppercase
 * gutter beside the text. That's the same person-cell vocabulary the People table and the card
 * headers use, so the transcript reads as part of the same product instead of as a log dump. The
 * user's real display name appears here too; "User" told the reader nothing they didn't know. */
function TurnView({
  turn,
  modal,
  prevMode,
  author,
}: {
  turn: Turn;
  modal?: Turn['permissionMode'];
  prevMode?: Turn['permissionMode'];
  author: string;
}) {
  const [showThinking, setShowThinking] = useState(false);
  const isUser = turn.role === 'user';
  // Icon, not a name: the speaker alternates side and colour, so a repeated name on every turn is
  // noise. The name still ships to assistive tech below, where alignment and hue mean nothing.
  const speaker = isUser ? author : turn.isSidechain ? 'Claude subagent' : 'Claude';
  return (
    <article className={`turn ${isUser ? 'user' : 'assistant'}${turn.isSidechain ? ' sidechain' : ''}`}>
      <span className="turn-avatar" aria-hidden>
        <Icon name={isUser ? 'person' : turn.isSidechain ? 'people' : 'lens'} size={14} />
      </span>
      <div className="turn-bubble">
        <span className="sr-only">{speaker}:</span>
        {(turn.isSidechain ||
          (turn.permissionMode && turn.permissionMode !== (prevMode ?? modal))) && (
          <div className="turn-meta">
            {turn.isSidechain && <span className="turn-tag">subagent</span>}
            <TurnModeBadge mode={turn.permissionMode} prev={prevMode} modal={modal} />
          </div>
        )}
        {turn.thinking && (
          <div className="thinking">
            <button
              className="thinking-toggle inline-icon"
              onClick={() => setShowThinking((v) => !v)}
              aria-expanded={showThinking}
            >
              <Icon name={showThinking ? 'chevronDown' : 'chevronRight'} size={11} />
              thinking
            </button>
            {showThinking && <pre className="thinking-text">{turn.thinking}</pre>}
          </div>
        )}
        {turn.text && <TurnText text={turn.text} />}
        {turn.toolCalls.length > 0 && (
          <div className="tool-calls">
            {turn.toolCalls.map((tc, i) => (
              <ToolCallRow key={i} tc={tc} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** Transcript body text.
 *
 * Deliberately NOT a markdown renderer — `web` has a 4-runtime-dep budget and a parser is not
 * worth one. Fenced code blocks are the single construct that actively hurts legibility when
 * shown raw (a transcript is mostly prose *about* code, and the fences swallow whole screens),
 * so only they are handled: split on ``` and alternate prose / <pre>. Odd-indexed segments are
 * inside a fence. An unterminated fence simply leaves its tail as a code block, which is the
 * same thing every markdown renderer does. Inline emphasis is left as written. */
function TurnText({ text }: { text: string }) {
  if (!text.includes('```')) return <div className="turn-text">{text}</div>;

  const parts = text.split('```');
  return (
    <div className="turn-text">
      {parts.map((part, i) => {
        if (i % 2 === 0) {
          // The blank lines that separated the prose from its fence are now doing nothing but
          // padding, because the <pre> brings its own margin. Trim them at each seam, but only
          // at a seam — interior blank lines are the author's paragraph breaks.
          let prose = part;
          if (i > 0) prose = prose.replace(/^\n+/, '');
          if (i < parts.length - 1) prose = prose.replace(/\n+$/, '');
          return prose ? <span key={i}>{prose}</span> : null;
        }
        // First line of a fenced block is the language tag, not content.
        const nl = part.indexOf('\n');
        const lang = nl === -1 ? '' : part.slice(0, nl).trim();
        const code = nl === -1 ? part : part.slice(nl + 1);
        return (
          <pre className="turn-code" key={i}>
            {lang && <span className="turn-code-lang">{lang}</span>}
            <code>{code.replace(/\n$/, '')}</code>
          </pre>
        );
      })}
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
