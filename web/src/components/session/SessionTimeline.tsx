import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Turn } from '@claudelens/shared';
import { fmtDateTime } from '../../format.js';
import { firstLine, lastAtOrBefore, useVisibleRange } from './hooks.js';

/** A gap between consecutive turns longer than this is "away", drawn as a break, not as time. */
const IDLE_MS = 10 * 60_000;
/** Within a working stretch, one turn is worth 1 unit plus 1 per this much wall-clock time. */
const UNIT_MS = 30_000;
const H = 28;
const PAD = 4;
/** Activity histogram bin width, px. */
const BIN = 2;

/** Time-independent layout: where each turn sits in "units", before the width is known.
 *
 * Positioning is neither pure time nor pure index. Pure time is useless on real sessions — one
 * spans 30 days with a 16-day gap, which would crush 1,400 turns into slivers either side of a
 * void. Pure index hides the one thing a timeline is for: where the person stopped to think. So
 * each turn costs 1 unit plus its preceding gap at 1 unit / 30 s, and any gap over 10 minutes costs
 * nothing in units but is drawn as a fixed-width break. A tight tool loop stays compact, a
 * five-minute read of a diff opens up visibly, and a night away is one hatched notch. */
export function layoutUnits(turns: Turn[]) {
  const n = turns.length;
  const u = new Float64Array(n);
  const brk = new Int32Array(n); // breaks at or before turn i
  const breaks: { i: number; ms: number }[] = [];
  let prev = NaN;
  let acc = 0;
  let failed = 0;
  let asks = 0;
  for (let i = 0; i < n; i++) {
    const t = turns[i].timestamp ? Date.parse(turns[i].timestamp!) : NaN;
    if (i > 0) {
      const g = Number.isFinite(t) && Number.isFinite(prev) ? Math.max(0, t - prev) : 0;
      if (g > IDLE_MS) breaks.push({ i, ms: g });
      else acc += 1 + g / UNIT_MS;
    }
    if (Number.isFinite(t)) prev = t;
    u[i] = acc;
    brk[i] = breaks.length;
    for (const c of turns[i].toolCalls) {
      if (c.error || c.denied) failed++;
      if (c.questions || c.declined) asks++;
    }
  }
  return { u, brk, breaks, total: acc, failed, asks };
}
type Units = ReturnType<typeof layoutUnits>;

/** Pixel geometry for one width: every mark kind merged into ONE path string, so the strip is ~8
 *  SVG elements whatever the session length — no per-turn nodes. Exported (with layoutUnits) so
 *  it can be exercised against a real session without a DOM. */
export function geometry(turns: Turn[], promptIdx: number[], L: Units, W: number) {
  const n = turns.length;
  const B = L.breaks.length;
  // Breaks get a fixed width, but never more than a quarter of the strip between them.
  const breakPx = B ? Math.min(12, (W * 0.25) / B) : 0;
  const scale = (W - 2 * PAD - B * breakPx) / Math.max(L.total, 1);
  const xs = new Float64Array(n);
  for (let i = 0; i < n; i++) xs[i] = PAD + L.u[i] * scale + L.brk[i] * breakPx;

  // Activity: assistant turns + their tool calls, binned to BIN px, bar height on a sqrt scale so
  // a burst of 40 tool calls doesn't flatten every ordinary turn to nothing.
  const bins = new Float64Array(Math.ceil(W / BIN) + 1);
  let failed = '';
  let denied = '';
  let asks = '';
  const seen = new Set<string>();
  const once = (k: string) => (seen.has(k) ? false : (seen.add(k), true));
  for (let i = 0; i < n; i++) {
    const t = turns[i];
    if (t.role !== 'assistant') continue;
    const x = xs[i];
    bins[Math.floor(x / BIN)] += 1 + t.toolCalls.length;
    const rx = Math.round(x * 2) / 2;
    for (const c of t.toolCalls) {
      if (c.denied && once(`d${rx}`)) denied += `M${rx} 13V${H - 2}`;
      else if (c.error && once(`f${rx}`)) failed += `M${rx} 13V${H - 2}`;
      if ((c.questions || c.declined) && once(`q${rx}`))
        asks += `M${rx - 2.5} 6.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0`;
    }
  }
  let maxC = 0;
  for (const c of bins) maxC = Math.max(maxC, c);
  let activity = '';
  const base = H - 2;
  const actH = 12;
  bins.forEach((c, b) => {
    if (!c) return;
    const h = Math.max(1.5, actH * Math.sqrt(c / maxC));
    activity += `M${b * BIN} ${base}h${BIN - 0.5}v${-h}h${-(BIN - 0.5)}z`;
  });

  let prompts = '';
  const promptXs = new Float64Array(promptIdx.length);
  promptIdx.forEach((i, k) => {
    promptXs[k] = xs[i];
    const rx = Math.round(xs[i] * 2) / 2;
    if (once(`p${rx}`)) prompts += `M${rx} 2.5V10.5`;
  });

  const breaks = L.breaks.map(({ i, ms }) => ({ i, ms, x0: xs[i - 1], x1: xs[i] }));
  let breakFill = '';
  let breakMarks = '';
  for (const b of breaks) {
    const w = b.x1 - b.x0;
    const m = (b.x0 + b.x1) / 2;
    if (w >= 4) breakFill += `M${b.x0 + 1} 1h${w - 2}v${H - 2}h${-(w - 2)}z`;
    // Two slashes: the familiar "axis break" mark. Collapses to a single hairline when crowded.
    breakMarks += w >= 7 ? `M${m - 3} ${H - 5}l3 ${-(H - 10)}M${m} ${H - 5}l3 ${-(H - 10)}` : `M${m} 3V${H - 3}`;
  }
  return { xs, promptXs, breaks, activity, prompts, failed, denied, asks, breakFill, breakMarks };
}
type Geo = ReturnType<typeof geometry>;

/** Index of the xs entry nearest x (xs is non-decreasing). */
function nearest(xs: Float64Array, x: number) {
  if (!xs.length) return -1;
  const k = Math.max(0, lastAtOrBefore(xs, x));
  return k + 1 < xs.length && xs[k + 1] - x < x - xs[k] ? k + 1 : k;
}

const fmtGap = (ms: number) => {
  const m = Math.round(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
};

type Hover = { x: number; i: number; brk?: number };

interface Props {
  turns: Turn[];
  /** Human prompt turn indices, ascending (SessionPage's `promptIdx`, skill bodies excluded). */
  promptIdx: number[];
  goTo: (i: number) => void;
}

/** A thin overview of the whole session, pinned in the sticky transcript bar.
 *
 * Top lane: human prompts (accent ticks) and AskUserQuestion moments (rings). Bottom lane: Claude's
 * activity as a histogram (turns + tool calls per 2px), with failed (danger) and denied (warning)
 * tool calls as full-height ticks over it. Hatched notches are idle gaps over 10 minutes. The tinted
 * window is what's on screen now. Click or drag to jump; arrow keys step prompts.
 *
 * Compactions and interrupts are counted in `stats` but not rendered as turns, so they have no
 * position to mark here. */
export const SessionTimeline = memo(function SessionTimeline({ turns, promptIdx, goTo }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Real-pixel viewBox, like Chart.tsx — see gotchas.md #8 (a fixed viewBox letterboxes).
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) setW(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = useMemo(() => layoutUnits(turns), [turns]);
  const geo = useMemo<Geo | null>(() => (W ? geometry(turns, promptIdx, L, W) : null), [turns, promptIdx, L, W]);
  const promptSet = useMemo(() => new Set(promptIdx), [promptIdx]);
  const range = useVisibleRange(turns.length);
  const [hover, setHover] = useState<Hover | null>(null);
  const dragging = useRef(false);
  const dragRaf = useRef(0);
  // Arrow keys fire faster than a smooth scroll settles, so for a moment the key cursor, not the
  // scroll position, is the truth about "current prompt".
  const keyCursor = useRef({ k: -1, at: 0 });

  const current = lastAtOrBefore(promptIdx, range.first);

  function pick(clientX: number): Hover | null {
    const el = wrapRef.current;
    if (!geo || !el) return null;
    const x = clientX - el.getBoundingClientRect().left;
    const b = geo.breaks.findIndex((br) => br.x1 - br.x0 >= 4 && x > br.x0 + 1 && x < br.x1 - 1);
    if (b >= 0) return { x, i: geo.breaks[b].i, brk: b };
    // Snap to a prompt tick within 4px — the ticks are what people aim at.
    const pk = nearest(geo.promptXs, x);
    if (pk >= 0 && Math.abs(geo.promptXs[pk] - x) <= 4) return { x, i: promptIdx[pk] };
    return { x, i: nearest(geo.xs, x) };
  }

  function scrollNow(i: number) {
    cancelAnimationFrame(dragRaf.current);
    dragRaf.current = requestAnimationFrame(() =>
      document.getElementById(`t-${i}`)?.scrollIntoView({ block: 'start' }),
    );
  }

  function stepPrompt(to: (k: number) => number) {
    if (!promptIdx.length || !geo) return;
    const base = Date.now() - keyCursor.current.at < 1200 ? keyCursor.current.k : current;
    const k = Math.max(0, Math.min(promptIdx.length - 1, to(base)));
    keyCursor.current = { k, at: Date.now() };
    const i = promptIdx[k];
    setHover({ x: geo.xs[i], i });
    goTo(i);
  }

  const failedN = L.failed;
  const summary =
    `Session timeline: ${turns.length} turns, ${promptIdx.length} prompts` +
    (failedN ? `, ${failedN} failed or denied tool calls` : '') +
    (L.asks ? `, ${L.asks} questions` : '') +
    (L.breaks.length ? `, ${L.breaks.length} idle gaps` : '') +
    '. Arrow keys step between prompts.';
  const curK = Math.max(current, 0);

  let tip: { when: string; kind: string; text: string } | null = null;
  if (hover && hover.i >= 0 && hover.i < turns.length) {
    if (hover.brk !== undefined) {
      const { i, ms } = L.breaks[hover.brk];
      tip = {
        when: `${fmtDateTime(turns[i - 1].timestamp)} → ${fmtDateTime(turns[i].timestamp)}`,
        kind: `Idle ${fmtGap(ms)}`,
        text: '',
      };
    } else tip = describe(turns[hover.i], promptSet.has(hover.i), hover.i);
  }

  const view = geo && {
    x: Math.max(0, geo.xs[range.first] - 2),
    w: Math.max(4, geo.xs[range.last] - geo.xs[range.first] + 4),
  };

  return (
    <div
      ref={wrapRef}
      className="timeline"
      role="slider"
      tabIndex={0}
      aria-label={summary}
      aria-valuemin={promptIdx.length ? 1 : 0}
      aria-valuemax={promptIdx.length}
      aria-valuenow={promptIdx.length ? curK + 1 : 0}
      aria-valuetext={
        promptIdx.length
          ? `Prompt ${curK + 1} of ${promptIdx.length}: ${firstLine(turns[promptIdx[curK]].text, 80)}`
          : 'No prompts'
      }
      onKeyDown={(e) => {
        const steps: Record<string, (k: number) => number> = {
          ArrowRight: (k) => k + 1,
          ArrowDown: (k) => k + 1,
          ArrowLeft: (k) => k - 1,
          ArrowUp: (k) => k - 1,
          PageDown: (k) => k + 10,
          PageUp: (k) => k - 10,
          Home: () => 0,
          End: () => promptIdx.length - 1,
        };
        const f = steps[e.key];
        if (!f) return;
        e.preventDefault();
        stepPrompt(f);
      }}
      onBlur={() => setHover(null)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const h = pick(e.clientX);
        if (!h) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        setHover(h);
        scrollNow(h.i);
      }}
      onPointerMove={(e) => {
        const h = pick(e.clientX);
        if (!h) return;
        setHover((p) => (p && p.i === h.i && p.brk === h.brk && Math.abs(p.x - h.x) < 1 ? p : h));
        // Dragging scrubs instantly (a smooth scroll per move would lag the pointer); the release
        // does the real goTo, which also opens the turn.
        if (dragging.current) scrollNow(h.i);
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        const h = pick(e.clientX);
        if (h) goTo(h.i);
      }}
      onPointerCancel={() => (dragging.current = false)}
      onPointerLeave={() => !dragging.current && setHover(null)}
    >
      {geo && view && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          <path className="tl-break" d={geo.breakFill} />
          <path className="tl-break-mark" d={geo.breakMarks} />
          <rect className="tl-view" x={view.x} y={0.5} width={view.w} height={H - 1} rx={3} />
          <path className="tl-activity" d={geo.activity} />
          <path className="tl-denied" d={geo.denied} />
          <path className="tl-failed" d={geo.failed} />
          <path className="tl-prompt" d={geo.prompts} />
          <path className="tl-ask" d={geo.asks} />
          {hover && <line className="tl-cursor" x1={hover.x} x2={hover.x} y1={0} y2={H} />}
        </svg>
      )}
      {tip && hover && (
        <div
          className="tl-tip"
          role="presentation"
          style={{ left: Math.max(110, Math.min(W - 110, hover.x)) }}
        >
          <div className="tl-tip-head">
            <strong>{tip.kind}</strong>
            <span>{tip.when}</span>
          </div>
          {tip.text && <div className="tl-tip-text">{tip.text}</div>}
        </div>
      )}
    </div>
  );
});

/** Tooltip copy for one turn: its kind, time and first words. */
function describe(t: Turn, isPrompt: boolean, i: number) {
  const when = t.timestamp ? fmtDateTime(t.timestamp) : `#${i + 1}`;
  if (t.role === 'user')
    return { when, kind: isPrompt ? 'Prompt' : 'Injected context', text: firstLine(t.text) };
  const calls = t.toolCalls;
  const bad = calls.filter((c) => c.error || c.denied).length;
  const asked = calls.some((c) => c.questions || c.declined);
  const kind =
    (t.isSidechain ? 'Subagent' : 'Claude') +
    (asked ? ' · asked a question' : '') +
    (calls.length ? ` · ${calls.length} tool call${calls.length > 1 ? 's' : ''}` : '') +
    (bad ? ` · ${bad} failed` : '');
  const text =
    firstLine(t.text) ||
    firstLine(
      calls
        .slice(0, 4)
        .map((c) => (c.detail ? `${c.name} ${c.detail}` : c.name))
        .join(', '),
    );
  return { when, kind, text };
}
