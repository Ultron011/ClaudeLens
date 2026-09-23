import { useMemo, useState, type SVGProps } from 'react';
import type { SessionStats } from '@claudelens/shared';
import { Icon } from '../Icon.js';

/** Parser v9 fields, read defensively: every one is optional and absent on older rows, and a row
 *  whose data is empty renders nothing (the `.session-facts` rule — no orphan labels). */

const NUM = new Intl.NumberFormat('en-US');

/** Two extra glyphs on Icon.tsx's geometry (16×16, stroke 1.5, round caps, currentColor), local
 *  to this file because Icon.tsx is shared and edits/writes only mean something here. */
function Glyph({ d, size = 11, ...rest }: { d: string; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}
const PENCIL = 'M10.75 2.75l2.5 2.5-7.5 7.5-3.25.75.75-3.25zM9.25 4.25l2.5 2.5';
const FILE_PLUS = 'M9.25 1.75H4.5A1.25 1.25 0 0 0 3.25 3v10a1.25 1.25 0 0 0 1.25 1.25h7A1.25 1.25 0 0 0 12.75 13V5.25zM8 7.25v4.5M5.75 9.5h4.5';

const TOP_FILES = 10;

/** "Files touched": the most-worked-on paths first (edits+writes weigh double a read, since a
 *  change says more about what the session was *about* than a look does), each with compact
 *  edit / write / read counters. Directory ellipsizes, basename never does. */
export function FilesTouchedFact({ files }: { files?: SessionStats['files'] }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(
    () =>
      Object.entries(files ?? {})
        .map(([path, f]) => ({
          path,
          reads: Number(f?.reads) || 0,
          edits: Number(f?.edits) || 0,
          writes: Number(f?.writes) || 0,
        }))
        .sort((a, b) => 2 * (b.edits + b.writes) + b.reads - (2 * (a.edits + a.writes) + a.reads) || a.path.localeCompare(b.path)),
    [files],
  );
  if (!rows.length) return null;
  const changed = rows.filter((r) => r.edits || r.writes).length;
  const shown = all ? rows : rows.slice(0, TOP_FILES);
  return (
    <div className="session-fact">
      <dt>Files touched</dt>
      <dd className="files-dd">
        <div className="files-sum">
          {rows.length} file{rows.length > 1 ? 's' : ''}
          {changed ? ` · ${changed} changed` : ''}
        </div>
        <ul className="files-touched">
          {shown.map((r) => {
            const cut = r.path.lastIndexOf('/') + 1;
            const title = [
              r.edits && `${r.edits} edit${r.edits > 1 ? 's' : ''}`,
              r.writes && `${r.writes} write${r.writes > 1 ? 's' : ''}`,
              r.reads && `${r.reads} read${r.reads > 1 ? 's' : ''}`,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={r.path} title={`${r.path} — ${title}`}>
                <span className="ft-path">
                  {cut > 0 && <span className="ft-dir">{r.path.slice(0, cut)}</span>}
                  <span className="ft-base">{r.path.slice(cut)}</span>
                </span>
                <span className="ft-counts">
                  <span className="sr-only">{title}</span>
                  {r.edits > 0 && (
                    <span className="ft-c ft-edit" aria-hidden>
                      <Glyph d={PENCIL} />
                      {r.edits}
                    </span>
                  )}
                  {r.writes > 0 && (
                    <span className="ft-c ft-write" aria-hidden>
                      <Glyph d={FILE_PLUS} />
                      {r.writes}
                    </span>
                  )}
                  {r.reads > 0 && (
                    <span className="ft-c" aria-hidden>
                      <Icon name="eye" size={11} />
                      {r.reads}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {rows.length > TOP_FILES && (
          <button type="button" className="link-btn files-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show all ${rows.length}`}
          </button>
        )}
      </dd>
    </div>
  );
}

/** Every branch the session ran on — only when that says more than the header's single branch. */
export function BranchesFact({ branches, headBranch }: { branches?: string[]; headBranch?: string }) {
  const list = (branches ?? []).filter(Boolean);
  if (!list.length || (list.length === 1 && list[0] === headBranch)) return null;
  return (
    <div className="session-fact">
      <dt>Branches</dt>
      <dd>
        {list.map((b) => (
          <span key={b} className="pill inline-icon">
            <Icon name="branch" size={11} />
            {b}
          </span>
        ))}
      </dd>
    </div>
  );
}

export function SlashCommandsFact({ commands }: { commands?: Record<string, number> }) {
  const list = Object.entries(commands ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!list.length) return null;
  return (
    <div className="session-fact">
      <dt>Slash commands</dt>
      <dd>
        {list.map(([c, n]) => (
          <span key={c} className="pill">
            {c.startsWith('/') ? c : `/${c}`} <span className="tag-count">{n}</span>
          </span>
        ))}
      </dd>
    </div>
  );
}

/** Lines added / removed, a `.metric` tile beside the others. From Claude Code's own `cost-state`
 *  accounting (`stats.reported`), so absent on sessions whose transcript has none. */
export function LinesMetric({ reported }: { reported?: SessionStats['reported'] }) {
  const add = Number(reported?.linesAdded) || 0;
  const del = Number(reported?.linesRemoved) || 0;
  if (!add && !del) return null;
  return (
    <div className="metric" title="Lines added / removed, as Claude Code reported them">
      <div className="metric-value lines-value">
        <span className="lines-add">+{NUM.format(add)}</span>
        <span className="lines-del">−{NUM.format(del)}</span>
      </div>
      <div className="metric-label">lines changed</div>
    </div>
  );
}
