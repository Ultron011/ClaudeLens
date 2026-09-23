import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Turn } from '@claudelens/shared';
import { fmtDate, fmtTime } from '../../format.js';
import { Icon } from '../Icon.js';
import { firstLine, ignoreShortcut, lastAtOrBefore, useVisibleRange } from './hooks.js';

interface Props {
  turns: Turn[];
  /** Human prompt turn indices, ascending — skill bodies are already excluded. */
  promptIdx: number[];
  goTo: (i: number) => void;
}

interface Item {
  i: number;
  label: string;
  time: string;
  /** Set on the first prompt of each calendar day, only when the session spans several. */
  day?: string;
}

function useItems(turns: Turn[], promptIdx: number[]): Item[] {
  return useMemo(() => {
    const days = new Set(promptIdx.map((i) => turns[i].timestamp?.slice(0, 10)).filter(Boolean));
    let lastDay = '';
    return promptIdx.map((i) => {
      const t = turns[i];
      const d = t.timestamp ? fmtDate(t.timestamp) : '';
      const item: Item = { i, label: firstLine(t.text, 120) || '(empty prompt)', time: fmtTime(t.timestamp) };
      if (days.size > 1 && d && d !== lastDay) item.day = lastDay = d;
      return item;
    });
  }, [turns, promptIdx]);
}

/** The list itself, shared by the side column and the popover. Highlights the prompt whose reply
 *  is on screen and keeps it scrolled into view inside its own box. */
function OutlineList({
  items,
  promptIdx,
  count,
  onPick,
  focusCurrent,
}: {
  items: Item[];
  promptIdx: number[];
  count: number;
  onPick: (i: number) => void;
  focusCurrent?: boolean;
}) {
  const range = useVisibleRange(count);
  const current = lastAtOrBefore(promptIdx, range.first);
  const listRef = useRef<HTMLOListElement>(null);
  const focused = useRef(!focusCurrent);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el =
      list.querySelector<HTMLElement>('[aria-current="true"]') ??
      (focused.current ? null : list.querySelector<HTMLElement>('button'));
    if (!el) return;
    // Scroll the list box by hand: element.scrollIntoView would also scroll the page.
    const top = el.offsetTop;
    if (top < list.scrollTop + 8 || top + el.offsetHeight > list.scrollTop + list.clientHeight - 8)
      list.scrollTop = top - list.clientHeight / 3;
    // Only the popover's first paint takes focus; later scroll-driven changes must not steal it.
    if (!focused.current) {
      focused.current = true;
      el.focus({ preventScroll: true });
    }
  }, [current]);

  return (
    <ol className="outline-list" ref={listRef}>
      {items.map((it, k) => (
        <li key={it.i}>
          {it.day && <div className="outline-day">{it.day}</div>}
          <button
            type="button"
            className="outline-item"
            aria-current={k === current ? 'true' : undefined}
            onClick={() => onPick(it.i)}
          >
            <span className="outline-n">{k + 1}</span>
            <span className="outline-label">{it.label}</span>
            {it.time && <span className="outline-time">{it.time}</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Wide screens: a sticky table of contents beside the transcript. */
export const PromptOutlineColumn = memo(function PromptOutlineColumn({ turns, promptIdx, goTo }: Props) {
  const items = useItems(turns, promptIdx);
  if (!items.length) return null;
  return (
    <nav className="outline-col" aria-label="Prompts in this session">
      <div className="outline-head">
        Prompts <span className="tag-count">{items.length}</span>
      </div>
      <OutlineList items={items} promptIdx={promptIdx} count={turns.length} onPick={goTo} />
    </nav>
  );
});

/** Narrower screens: an "Outline" chip in the transcript bar opening the same list as a popover
 *  (a bottom sheet on phones). Owns its own open state — and its `o` shortcut — so toggling it
 *  never re-renders SessionPage's 1,500 turns. Closes on Esc, outside click, or a pick. */
export const PromptOutlineToggle = memo(function PromptOutlineToggle({ turns, promptIdx, goTo }: Props) {
  const items = useItems(turns, promptIdx);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        btnRef.current?.focus();
      } else if (e.key === 'o' && !ignoreShortcut(e) && !document.querySelector('dialog[open]')) {
        setOpen((v) => !v);
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (open && !boxRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  if (!items.length) return null;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={open ? 'chip on' : 'chip'}
        aria-expanded={open}
        aria-controls="prompt-outline-pop"
        title="Prompt outline (o)"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="layers" size={12} />
        Outline
      </button>
      {open && (
        <div ref={boxRef} id="prompt-outline-pop" className="outline-pop" role="dialog" aria-label="Prompts in this session">
          <div className="outline-head">
            Prompts <span className="tag-count">{items.length}</span>
            <button type="button" className="chip icon outline-close" aria-label="Close outline" onClick={() => setOpen(false)}>
              <Icon name="close" size={12} />
            </button>
          </div>
          <OutlineList
            items={items}
            promptIdx={promptIdx}
            count={turns.length}
            focusCurrent
            onPick={(i) => {
              setOpen(false);
              goTo(i);
            }}
          />
        </div>
      )}
    </>
  );
});
