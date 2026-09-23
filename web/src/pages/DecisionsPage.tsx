import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDecisions, type Decision, type DecisionQuestion, type DecisionsResponse } from '../api.insights.js';
import { fmtDateTime } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Kpi, KpiSkeleton } from '../components/Kpi.js';
import { Icon } from '../components/Icon.js';
import { useFetch } from '../useFetch.js';
import { useToast, errText } from '../components/Toast.js';
import {
  Coverage,
  ErrorState,
  InsightsTabs,
  ScopeFilters,
  pct,
  useInsightScope,
} from '../components/insights/InsightsChrome.js';
import '../styles.insights.css';

const PAGE = 30;
const RECOMMENDED = /\s*\((recommended)\)\s*/i;

export function DecisionsPage() {
  const { params, person, project, setParam, scope, scopeKey, rangeLabel, rangePicker } = useInsightScope();
  const q = params.get('q') ?? '';
  const notes = params.get('notes') === 'true';
  const toast = useToast();

  const { data, err, loading } = useFetch<DecisionsResponse>(
    (signal) => getDecisions({ ...scope, q: q || undefined, notes, limit: PAGE, offset: 0 }, signal),
    [scopeKey, q, notes],
  );

  // "Load more" pages append here; any filter change discards them (and any in-flight page).
  const [more, setMore] = useState<Decision[]>([]);
  const [moreHasMore, setMoreHasMore] = useState<boolean | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const gen = useRef(0);
  useEffect(() => {
    gen.current++;
    setMore([]);
    setMoreHasMore(null);
    setMoreLoading(false);
  }, [scopeKey, q, notes]);

  const items = [...(data?.items ?? []), ...more];
  const hasMore = moreHasMore ?? Boolean(data?.hasMore);

  async function loadMore() {
    if (!hasMore || moreLoading) return;
    const g = gen.current;
    setMoreLoading(true);
    try {
      const next = await getDecisions({ ...scope, q: q || undefined, notes, limit: PAGE, offset: items.length });
      if (g !== gen.current) return;
      setMore((cur) => [...cur, ...next.items]);
      setMoreHasMore(next.hasMore);
    } catch (e) {
      if (g === gen.current) toast(`Couldn’t load more decisions: ${errText(e)}`, 'error');
    } finally {
      if (g === gen.current) setMoreLoading(false);
    }
  }

  const s = data?.stats;
  const first = loading && !data;

  return (
    <Shell crumbs={[{ label: 'Insights', to: '/insights/decisions' }, { label: 'Decisions' }]} actions={rangePicker}>
      <div className="page-head">
        <div>
          <h1>Decision log</h1>
          <p className="lede">
            Every time Claude stopped to ask: the options it offered, what was picked and any note
            left with it, over {rangeLabel}. Newest first.
          </p>
        </div>
        <div className="page-head-actions">
          <InsightsTabs />
        </div>
      </div>

      <ScopeFilters
        person={person}
        project={project}
        projects={data?.projects.map((p) => p.project) ?? []}
        setParam={setParam}
      >
        <SearchBox value={q} onChange={(v) => setParam('q', v || null)} />
        <button
          type="button"
          className={notes ? 'chip on' : 'chip'}
          aria-pressed={notes}
          onClick={() => setParam('notes', notes ? null : 'true')}
        >
          <Icon name="message" size={13} />
          With notes only
        </button>
      </ScopeFilters>

      {err ? (
        <ErrorState title="Couldn’t load decisions" err={err} />
      ) : (
        <>
          <div className="kpi-row">
            {first || !s ? (
              <>
                <KpiSkeleton label="Decisions" />
                <KpiSkeleton label="With a note" />
                <KpiSkeleton label="Took the recommendation" />
                <KpiSkeleton label="Wrote their own" />
              </>
            ) : (
              <>
                <Kpi
                  label="Decisions"
                  icon="message"
                  value={s.questions.toLocaleString()}
                  foot={`${s.calls.toLocaleString()} prompts · ${s.dismissed} dismissed`}
                  primary
                />
                <Kpi
                  label="With a note"
                  icon="copy"
                  value={pct(s.withNotes, s.questions)}
                  foot={`${s.withNotes} of ${s.questions} questions`}
                />
                <Kpi
                  label="Took the recommendation"
                  icon="check"
                  value={pct(s.recommended, s.answered)}
                  foot={
                    s.offeredRecommended
                      ? `${pct(s.pickedWhenOffered, s.offeredRecommended)} when one was offered (${s.offeredRecommended})`
                      : 'none offered a “Recommended” option'
                  }
                />
                <Kpi
                  label="Wrote their own"
                  icon="person"
                  value={pct(s.custom, s.answered)}
                  foot={`typed an answer instead of picking`}
                />
              </>
            )}
          </div>

          {s && s.answered > 0 && <PickSplit s={s} />}

          {data && (
            <Coverage>
              Based on {data.coverage.withData.toLocaleString()} of{' '}
              {data.coverage.calls.toLocaleString()} AskUserQuestion prompts in this range. Question
              text and answers are only captured for sessions synced with parser v6+; older sessions
              count as prompts but can’t be shown until they re-sync.
            </Coverage>
          )}

          {first ? (
            <div className="skel" style={{ height: 320, borderRadius: 'var(--r-lg)' }} />
          ) : items.length === 0 ? (
            <div className="empty">
              <Icon name="message" size={22} className="empty-icon" />
              <h3>No decisions match</h3>
              <p className="muted">
                {q || notes || project || person
                  ? 'Try clearing a filter or widening the date range.'
                  : 'No AskUserQuestion prompts with recorded answers in this range.'}
              </p>
            </div>
          ) : (
            <>
              <p className="ins-count muted">
                {data?.total.toLocaleString()} {data?.total === 1 ? 'prompt' : 'prompts'}
                {q && <> matching “{q}”</>}
                {notes && ' with a note'}
              </p>
              <ol className="ins-decisions">
                {items.map((d) => (
                  <li key={d.id}>
                    <DecisionCard d={d} highlight={q} />
                  </li>
                ))}
              </ol>
              {hasMore && (
                <div className="load-more">
                  <button type="button" className="chip" disabled={moreLoading} onClick={loadMore}>
                    {moreLoading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Shell>
  );
}

/** Debounced search field: typing doesn't refetch per keystroke, Enter applies immediately. */
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (v.trim() === value) return;
    const t = setTimeout(() => onChange(v.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <form
      role="search"
      className="ins-search"
      onSubmit={(e) => {
        e.preventDefault();
        onChange(v.trim());
      }}
    >
      <Icon name="search" size={13} />
      <input
        type="search"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Search questions, answers, notes…"
        aria-label="Search decisions"
      />
    </form>
  );
}

/** Recommended vs another option vs own answer, as one stacked bar. */
function PickSplit({ s }: { s: NonNullable<DecisionsResponse['stats']> }) {
  const parts = [
    { key: 'rec', label: 'Recommended option', n: s.recommended, cls: 'rec' },
    { key: 'opt', label: 'Another option', n: s.option, cls: 'opt' },
    { key: 'own', label: 'Own answer', n: s.custom, cls: 'own' },
  ];
  return (
    <section className="panel ins-split" aria-label="What was picked">
      <div className="ins-split-bar" role="img" aria-label={parts.map((p) => `${p.label} ${pct(p.n, s.answered)}`).join(', ')}>
        {parts.map((p) =>
          p.n > 0 ? <span key={p.key} className={`ins-split-seg ${p.cls}`} style={{ flexGrow: p.n }} /> : null,
        )}
      </div>
      <ul className="ins-split-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <i className={`ins-split-dot ${p.cls}`} aria-hidden />
            {p.label}
            <strong>{pct(p.n, s.answered)}</strong>
            <span className="muted">{p.n}</span>
          </li>
        ))}
        <li className="muted">of {s.answered} answered questions</li>
      </ul>
    </section>
  );
}

function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function DecisionCard({ d, highlight }: { d: Decision; highlight: string }) {
  return (
    <article className={d.dismissed ? 'ins-decision dismissed' : 'ins-decision'}>
      <header className="ins-decision-head">
        <Link to={`/u/${encodeURIComponent(d.author)}`} className="person">
          <span className="avatar" aria-hidden>
            {d.label.slice(0, 1).toUpperCase()}
          </span>
          {d.label}
        </Link>
        {d.project && (
          <Link to={`/u/${encodeURIComponent(d.author)}/${encodeURIComponent(d.project)}`} className="ins-meta mono">
            {d.project}
          </Link>
        )}
        {d.timestamp && (
          <time className="ins-meta" dateTime={d.timestamp}>
            {fmtDateTime(d.timestamp)}
          </time>
        )}
        {d.dismissed && (
          <span className="ins-flag" title={d.denied ? `Blocked: ${d.denied}` : undefined}>
            {d.denied && d.denied !== 'user-rejected' ? `Blocked · ${d.denied}` : 'Dismissed'}
          </span>
        )}
        <Link to={`/session/${d.sessionId}#t-${d.turnIndex}`} className="ins-open">
          Open in session
          <Icon name="arrowUpRight" size={12} />
        </Link>
      </header>
      <p className="ins-decision-title" title={d.title}>
        {d.title}
      </p>
      {d.questions.map((q, i) => (
        <QuestionBlock key={i} q={q} dismissed={d.dismissed} highlight={highlight} />
      ))}
    </article>
  );
}

function QuestionBlock({ q, dismissed, highlight }: { q: DecisionQuestion; dismissed: boolean; highlight: string }) {
  const picked = new Set(q.picked);
  return (
    <div className="ins-q">
      <div className="ins-q-head">
        {q.header && <span className="ins-q-header">{q.header}</span>}
        {q.multiSelect && <span className="ins-q-multi">multi-select</span>}
      </div>
      <p className="ins-q-text">
        <Mark text={q.question} q={highlight} />
      </p>
      {(q.options.length > 0 || q.custom) && (
        <ul className="ins-opts">
          {q.options.map((o) => {
            const rec = RECOMMENDED.test(o);
            const on = picked.has(o);
            return (
              <li key={o} className={on ? 'picked' : undefined}>
                <Icon name={on ? 'check' : 'dot'} size={11} />
                <span>
                  <Mark text={rec ? o.replace(RECOMMENDED, ' ').trim() : o} q={highlight} />
                </span>
                {rec && <span className="ins-rec">Recommended</span>}
                {on && <span className="sr-only"> (picked)</span>}
              </li>
            );
          })}
          {q.custom && (
            <li className="picked custom">
              <Icon name="check" size={11} />
              <span>
                <span className="ins-other">Other:</span> <Mark text={q.custom} q={highlight} />
              </span>
            </li>
          )}
        </ul>
      )}
      {q.pick === 'unanswered' && !dismissed && <p className="ins-q-none muted">No answer recorded.</p>}
      {q.notes && (
        <blockquote className="ins-note">
          <span className="ins-note-label">Note</span>
          <Mark text={q.notes} q={highlight} />
        </blockquote>
      )}
    </div>
  );
}
