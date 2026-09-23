import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { AskedQuestion, Turn, ToolCall } from '@claudelens/shared';
import { getSession, patchSession, deleteSession, type SessionDetail } from '../api.js';
import { fmtDuration, fmtTokens, fmtCost, fmtTime, fmtDateTime, msgCount } from '../format.js';
import { Shell, type Crumb } from '../components/Shell.js';
import { Metric } from '../components/Stat.js';
import { Icon } from '../components/Icon.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { AccountLine } from '../components/AccountLine.js';
import { TurnModeBadge, modalMode } from '../components/ModeBadges.js';
import { useFetch } from '../useFetch.js';
import { useToast, errText } from '../components/Toast.js';
import { NotFoundPage } from './NotFoundPage.js';

/** Claude Code injects a whole skill's markdown as a user-role turn; it isn't something the
 *  person typed, so it renders as a collapsed "skill loaded" line instead of a user bubble. */
const SKILL_BODY = /^Base directory for this skill:\s*(\S+)/;

/** Everything find-in-transcript searches for one turn. */
const turnHaystack = (t: Turn) =>
  [t.text, t.thinking, ...t.toolCalls.flatMap((c) => [c.name, c.detail, c.args])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

export function SessionPage() {
  const { id = '' } = useParams<{ id: string }>();
  const {
    data: s,
    err,
    refetch,
  } = useFetch<SessionDetail>((signal) => getSession(id, signal), [id]);
  const [pendingDelete, setPendingDelete] = useState(false);
  // Expand/collapse-all broadcast: `v` bumps on every click so each message re-syncs to `open`
  // even when it was toggled by hand since the last broadcast.
  const [expandAll, setExpandAll] = useState({ open: false, v: 0 });
  // One-shot "open and scroll to turn i" (permalink on load, find, prompt stepper). `v` bumps so
  // revealing the same turn twice still re-opens it.
  const [reveal, setReveal] = useState({ i: -1, v: 0 });
  const [find, setFind] = useState('');
  const [findPos, setFindPos] = useState(0);
  const nav = useNavigate();
  const toast = useToast();
  const { hash } = useLocation();
  const turns = s?.turns ?? [];

  const goTo = useCallback((i: number) => {
    setReveal((r) => ({ i, v: r.v + 1 }));
    // After the reveal renders, so the scroll lands on the expanded height.
    requestAnimationFrame(() =>
      document.getElementById(`t-${i}`)?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      }),
    );
  }, []);

  // Permalink: /session/:id#t-42 opens and scrolls to that turn once the transcript arrives.
  const linkedOnce = useRef(false);
  useEffect(() => {
    const m = /^#t-(\d+)$/.exec(hash);
    if (!m || !turns.length || linkedOnce.current) return;
    linkedOnce.current = true;
    goTo(Number(m[1]));
  }, [hash, turns.length, goTo]);

  const promptIdx = useMemo(
    () => turns.flatMap((t, i) => (t.role === 'user' && !SKILL_BODY.test(t.text) ? [i] : [])),
    [turns],
  );
  const matches = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (q.length < 2) return [];
    return turns.flatMap((t, i) => (turnHaystack(t).includes(q) ? [i] : []));
  }, [turns, find]);
  const matchSet = useMemo(() => new Set(matches), [matches]);

  function stepFind(dir: 1 | -1) {
    if (!matches.length) return;
    const next = (findPos + dir + matches.length) % matches.length;
    setFindPos(next);
    goTo(matches[next]);
  }

  /** Next/previous human prompt relative to what's on screen now. */
  const stepPrompt = useCallback(
    (dir: 1 | -1) => {
      const tops = promptIdx.map((i) => document.getElementById(`t-${i}`)?.getBoundingClientRect().top ?? 0);
      const band = 90; // below the sticky bars
      const target =
        dir === 1
          ? promptIdx.find((_, k) => tops[k] > band + 4)
          : [...promptIdx].reverse().find((_, k) => tops[promptIdx.length - 1 - k] < band - 4);
      if (target !== undefined) goTo(target);
    },
    [promptIdx, goTo],
  );

  // j / k step between prompts, like a reader. Ignored while typing in any field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'j') stepPrompt(1);
      else if (e.key === 'k') stepPrompt(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [stepPrompt]);

  async function patch(body: { featured?: boolean; hidden?: boolean }, ok: string) {
    if (!s) return;
    try {
      await patchSession(s.id, body);
      toast(ok);
      refetch();
    } catch (e) {
      toast(`Couldn’t update the session: ${errText(e)}`, 'error');
    }
  }
  const toggleFeatured = () =>
    patch({ featured: !s?.featured }, s?.featured ? 'Removed from featured' : 'Featured');
  const toggleHidden = () =>
    patch({ hidden: !s?.hidden }, s?.hidden ? 'Restored to the gallery' : 'Hidden from the gallery and team stats');

  async function copyLink(i: number) {
    const url = `${location.origin}/session/${id}#t-${i}`;
    history.replaceState(null, '', `#t-${i}`);
    try {
      await navigator.clipboard.writeText(url);
      toast('Link to this message copied');
    } catch {
      toast('Copy failed — the address bar now links to this message', 'error');
    }
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

  if (err === 'not found') return <NotFoundPage what="session" />;
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
          <button
            className={s.hidden ? 'chip on' : 'chip'}
            onClick={toggleHidden}
            aria-pressed={s.hidden}
            title="Hidden sessions stay out of the gallery and team stats"
          >
            <Icon name={s.hidden ? 'eye' : 'eyeOff'} size={13} />
            {s.hidden ? 'Unhide' : 'Hide'}
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
            re-syncs but stays hidden until you <button type="button" className="link-btn" onClick={toggleHidden}>unhide it</button>.
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
            {s.startedAt && <Metric label="started" value={fmtDateTime(s.startedAt)} />}
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
            {st.subagentUsage && Object.keys(st.subagentUsage).length > 0 && (
              <div className="session-fact">
                <dt>Subagent work</dt>
                <dd>
                  {Object.entries(st.subagentUsage)
                    .sort((a, b) => b[1].costUsd - a[1].costUsd)
                    .map(([name, u]) => (
                      <span
                        key={name}
                        className="pill agent"
                        title={`${u.runs} run(s) · ${fmtTokens(u.totalTokens)} tokens · ${u.toolCalls} tool calls`}
                      >
                        @{name} <span className="tag-count">{fmtCost(u.costUsd)}</span>
                      </span>
                    ))}
                </dd>
              </div>
            )}
            {st.toolErrors && Object.keys(st.toolErrors).length > 0 && (
              <div className="session-fact">
                <dt>Tool failures</dt>
                <dd>
                  {Object.entries(st.toolErrors)
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, n]) => (
                      <span key={t} className="pill pill-error" title={`${n} of ${st.toolUsage[t] ?? '?'} ${t} calls failed`}>
                        {t} <span className="tag-count">{n}/{st.toolUsage[t] ?? '?'}</span>
                      </span>
                    ))}
                  {Object.entries(st.toolDenials ?? {}).map(([k, n]) => (
                    <span key={k} className="pill" title="Tool calls blocked before they ran">
                      denied: {k} <span className="tag-count">{n}</span>
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {(st.interrupts || st.compactions || st.apiErrors) ? (
              <div className="session-fact">
                <dt>Events</dt>
                <dd>
                  {st.interrupts ? <span className="pill">{st.interrupts} interrupted</span> : null}
                  {st.compactions ? <span className="pill">{st.compactions} compacted</span> : null}
                  {st.apiErrors ? (
                    <span className="pill pill-error">
                      {st.apiErrors} API errors
                      {st.rateLimitHits ? ` (${st.rateLimitHits} usage limit)` : ''}
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : null}
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

        {/* Sticky: long sessions (1,500+ turns) need find and prompt-to-prompt jumps from any
          * scroll position, not just the top. */}
        <div className="transcript-bar" role="toolbar" aria-label="Transcript">
          <form
            className="transcript-find"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              stepFind(1);
            }}
          >
            <Icon name="search" size={12} />
            <input
              type="search"
              placeholder="Find in transcript…"
              aria-label="Find in transcript"
              value={find}
              onChange={(e) => {
                setFind(e.target.value);
                setFindPos(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  stepFind(-1);
                }
              }}
            />
            {find.trim().length >= 2 && (
              <span className="find-count" aria-live="polite">
                {matches.length ? `${Math.max(findPos, 0) + 1} of ${matches.length}` : 'no matches'}
              </span>
            )}
            <button type="button" className="chip icon" aria-label="Previous match" disabled={!matches.length} onClick={() => stepFind(-1)}>
              <Icon name="arrowUp" size={12} />
            </button>
            <button type="submit" className="chip icon" aria-label="Next match" disabled={!matches.length}>
              <Icon name="arrowDown" size={12} />
            </button>
          </form>
          <div className="transcript-bar-actions">
            <span className="muted prompt-nav-label" title="Keyboard: j / k">
              {promptIdx.length} prompts
            </span>
            <button type="button" className="chip icon" aria-label="Previous prompt (k)" title="Previous prompt (k)" onClick={() => stepPrompt(-1)}>
              <Icon name="arrowUp" size={12} />
            </button>
            <button type="button" className="chip icon" aria-label="Next prompt (j)" title="Next prompt (j)" onClick={() => stepPrompt(1)}>
              <Icon name="arrowDown" size={12} />
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => setExpandAll((x) => ({ open: !x.open, v: x.v + 1 }))}
            >
              <Icon name={expandAll.open ? 'chevronDown' : 'chevronRight'} size={12} />
              {expandAll.open ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
        </div>
        <div className="transcript">
          {s.turns.map((t, i) => (
            <TurnView
              key={i}
              index={i}
              turn={t}
              expandAll={expandAll}
              revealV={reveal.i === i ? reveal.v : 0}
              matched={matchSet.has(i)}
              current={matches[findPos] === i}
              onCopyLink={copyLink}
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
  expandAll,
  index,
  revealV,
  matched,
  current,
  onCopyLink,
}: {
  turn: Turn;
  modal?: Turn['permissionMode'];
  prevMode?: Turn['permissionMode'];
  author: string;
  expandAll: { open: boolean; v: number };
  index: number;
  revealV: number;
  matched: boolean;
  current: boolean;
  onCopyLink: (i: number) => void;
}) {
  const [showThinking, setShowThinking] = useSyncedOpen(expandAll, revealV);
  const isUser = turn.role === 'user';
  const skill = isUser ? SKILL_BODY.exec(turn.text)?.[1] : undefined;
  // Icon, not a name: the speaker alternates side and colour, so a repeated name on every turn is
  // noise. The name still ships to assistive tech below, where alignment and hue mean nothing.
  const speaker = isUser ? author : turn.isSidechain ? 'Claude subagent' : 'Claude';
  return (
    <article
      id={`t-${index}`}
      className={`turn ${isUser ? 'user' : 'assistant'}${turn.isSidechain ? ' sidechain' : ''}${skill ? ' injected' : ''}${matched ? ' matched' : ''}${current ? ' current' : ''}`}
    >
      <span className="turn-avatar" aria-hidden>
        <Icon name={isUser ? 'person' : turn.isSidechain ? 'people' : 'lens'} size={14} />
      </span>
      <div className="turn-bubble">
        <span className="sr-only">{speaker}:</span>
        {/* Time doubles as the permalink: click copies a link straight to this message. */}
        <button
          type="button"
          className="turn-stamp"
          title={turn.timestamp ? `${fmtDateTime(turn.timestamp)} — copy link to this message` : 'Copy link to this message'}
          onClick={() => onCopyLink(index)}
        >
          {turn.timestamp ? fmtTime(turn.timestamp) : '#'}
          <Icon name="link" size={10} />
        </button>
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
        {turn.text && (
          <CollapsibleText
            text={turn.text}
            expandAll={expandAll}
            revealV={revealV}
            preview={skill ? `Skill instructions loaded: ${skill.split('/').pop()}` : undefined}
          />
        )}
        {turn.toolCalls.length > 0 && (
          <div className="tool-calls">
            {turn.toolCalls.map((tc, i) => (
              <ToolCallRow key={i} tc={tc} expandAll={expandAll} revealV={revealV} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

type ExpandAll = { open: boolean; v: number };

/** Open state for any collapsible piece of a turn (text, thinking, tool call, question): starts
 *  and re-syncs with the page's Expand/Collapse-all broadcast, and is forced open when the page
 *  reveals this turn (permalink, find, prompt stepper). One hook so every "message" on the page
 *  behaves the same way. */
function useSyncedOpen(expandAll: ExpandAll, revealV = 0) {
  const [open, setOpen] = useState(expandAll.open);
  useEffect(() => setOpen(expandAll.open), [expandAll.v]);
  useEffect(() => {
    if (revealV) setOpen(true);
  }, [revealV]);
  return [open, setOpen] as const;
}

/** A message is long when it wouldn't fit on its one-line preview anyway. */
const isLong = (text: string) => text.includes('\n') || text.length > 140;

/** Message body as an accordion: a one-line preview by default, the full text on click.
 *  Short one-liners render as-is — a toggle that reveals nothing is just noise. */
function CollapsibleText({
  text,
  expandAll,
  revealV = 0,
  preview,
}: {
  text: string;
  expandAll: { open: boolean; v: number };
  /** Bumped by the page to force this message open (permalink, find, prompt stepper). */
  revealV?: number;
  /** Replaces the first-line preview (e.g. injected skill bodies). */
  preview?: string;
}) {
  const [open, setOpen] = useSyncedOpen(expandAll, revealV);
  if (!isLong(text) && !preview) return <TurnText text={text} />;

  if (!open) {
    const firstLine = preview ?? text.split('\n').find((l) => l.trim()) ?? '';
    return (
      <button
        type="button"
        className="turn-preview"
        aria-expanded={false}
        title="Show full message"
        onClick={() => setOpen(true)}
      >
        <Icon name="chevronRight" size={11} />
        <span className="turn-preview-text">{firstLine.replace(/^`{3}.*$/, '(code)')}</span>
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className="turn-collapse"
        aria-expanded
        onClick={() => setOpen(false)}
      >
        <Icon name="chevronDown" size={11} />
        collapse
      </button>
      <TurnText text={text} />
    </>
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
            <CopyButton text={code.replace(/\n$/, '')} />
            <code>{code.replace(/\n$/, '')}</code>
          </pre>
        );
      })}
    </div>
  );
}

/** One tool call as an accordion row, like a message: collapsed it shows the tool, its target
 *  and the first line of its input; opening it shows the whole input with its line breaks. Rows
 *  whose input already fits on one line render flat, with no toggle. */
function ToolCallRow({ tc, expandAll, revealV }: { tc: ToolCall; expandAll: ExpandAll; revealV: number }) {
  const [open, setOpen] = useSyncedOpen(expandAll, revealV);
  const args = tc.args ?? '';
  const firstLine = args.split('\n', 1)[0];
  const expandable = args.includes('\n') || args.length > 90;
  const status = (tc.error || tc.denied) && (
    <span className="tc-status" title={tc.denied ? `Blocked before running (${tc.denied})` : 'The tool returned an error'}>
      {tc.denied ? `denied · ${tc.denied}` : 'failed'}
    </span>
  );
  const cls = `tool-call${tc.error ? ' failed' : ''}${tc.denied ? ' denied' : ''}${open && expandable ? ' open' : ''}`;
  const inner = (
    <>
      <span className="tc-chevron" aria-hidden>
        {expandable && <Icon name={open ? 'chevronDown' : 'chevronRight'} size={10} />}
      </span>
      <span className="tc-name">{tc.name}</span>
      {tc.detail && <span className="tc-detail">{tc.detail}</span>}
      {args && (
        <span className="tc-args" title={expandable ? undefined : args}>
          {firstLine}
          {expandable && !open && args.length > firstLine.length ? ' …' : ''}
        </span>
      )}
      {status}
    </>
  );

  const row = expandable ? (
    <div className={cls}>
      <button type="button" className="tc-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {inner}
      </button>
      {open && <pre className="tc-full">{args}</pre>}
    </div>
  ) : (
    <div className={cls}>
      <div className="tc-head">{inner}</div>
    </div>
  );

  if (!tc.questions && !tc.declined) return row;
  return (
    <div className="ask-block">
      {row}
      {tc.declined && <div className="ask-declined">User dismissed the question</div>}
      {tc.questions?.map((q, i) => (
        <AskedQuestionRow key={i} q={q} expandAll={expandAll} revealV={revealV} />
      ))}
    </div>
  );
}

/** Which of the offered options the answer picked, plus any text the user typed instead
 *  ("Other"). Claude Code joins multiSelect picks with ", ", so labels are matched against both
 *  the whole answer and its comma-split parts. */
function splitAnswer(q: AskedQuestion): { picked: Set<string>; custom?: string } {
  const picked = new Set<string>();
  if (!q.answer) return { picked };
  if (q.options.includes(q.answer)) return { picked: new Set([q.answer]) };
  const rest: string[] = [];
  for (const part of q.answer.split(', ')) {
    if (q.options.includes(part)) picked.add(part);
    else rest.push(part);
  }
  return { picked, custom: rest.length ? rest.join(', ') : undefined };
}

/** One AskUserQuestion question: a one-line "header → answer" summary that opens to the full
 *  question, every offered option (picked ones marked), and the user's note. */
function AskedQuestionRow({ q, expandAll, revealV }: { q: AskedQuestion; expandAll: ExpandAll; revealV: number }) {
  const [open, setOpen] = useSyncedOpen(expandAll, revealV);
  const { picked, custom } = splitAnswer(q);
  return (
    <div className={`ask-q${open ? ' open' : ''}`}>
      <button
        type="button"
        className="ask-q-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={11} />
        <span className="ask-q-label">{q.header || q.question}</span>
        <span className={`ask-q-answer${q.answer ? '' : ' none'}`}>
          {q.answer ?? 'no answer'}
        </span>
        {q.notes && <span className="ask-q-flag">note</span>}
      </button>
      {open && (
        <div className="ask-q-body">
          <div className="ask-q-question">{q.question}</div>
          {q.options.length > 0 && (
            <ul className="ask-q-options">
              {q.options.map((o) => (
                <li key={o} className={picked.has(o) ? 'picked' : undefined}>
                  <Icon name={picked.has(o) ? 'check' : 'dot'} size={11} />
                  {o}
                </li>
              ))}
              {custom && (
                <li className="picked custom">
                  <Icon name="check" size={11} />
                  <span>
                    <em>Other:</em> {custom}
                  </span>
                </li>
              )}
            </ul>
          )}
          {q.notes && (
            <blockquote className="ask-q-notes">
              <span className="ask-q-notes-label">Note</span>
              {q.notes}
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="code-copy"
      aria-label="Copy code"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard blocked (insecure context / permissions) — nothing useful to do
        }
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={11} />
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}
