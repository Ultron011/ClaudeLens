import type { PermissionMode, Turn } from '@claudelens/shared';

/** Fixed colors for the modes called out in the spec. Anything else — including future or
 *  unrecognized enum values, the permissionMode enum drifts between Claude Code releases and
 *  "auto" itself has never been observed on disk — falls back to a neutral class. A lookup with
 *  a fallback, never an exhaustive switch over the mode string. */
const MODE_CLASS: Record<string, string> = {
  bypassPermissions: 'mode-bypass',
  plan: 'mode-plan',
  auto: 'mode-auto',
};

function modeClass(mode: string): string {
  return MODE_CLASS[mode] ?? 'mode-other';
}

/** Most frequent permissionMode across a session's turns. Used so the per-turn badge only shows
 *  when a turn's mode is an outlier, not the session's own default. */
export function modalMode(turns: Turn[]): PermissionMode | undefined {
  const counts = new Map<PermissionMode, number>();
  for (const t of turns) {
    if (t.permissionMode) counts.set(t.permissionMode, (counts.get(t.permissionMode) ?? 0) + 1);
  }
  let best: PermissionMode | undefined;
  let bestCount = 0;
  for (const [mode, count] of counts) {
    if (count > bestCount) {
      best = mode;
      bestCount = count;
    }
  }
  return best;
}

/* A session-level `ModeBadges` component lived here, rendering an "auto mode" pill plus a pill per
 * observed mode. It was deleted once mode was removed from both the session header and the session
 * list: nothing rendered it, and `stats.permissionModes` / `stats.usedAutoMode` are still on the
 * API if it's ever wanted back (see git history). Mode *changes* are still surfaced inline by
 * `TurnModeBadge` below, which is the signal that actually earned its space. */

/** Per-turn mode badge — a **transition marker**, not a per-turn label.
 *
 * It renders only when this turn's mode differs from the previous turn's, i.e. at the point the
 * mode actually changed; from there the reader carries it forward. Comparing against the session's
 * *modal* mode instead (the previous behaviour) badges every turn in the minority mode, which on a
 * real 388-turn session with two modes meant a badge on roughly half the bubbles — the exact noise
 * this badge exists to avoid. `prev === undefined` is the first turn, which only badges if it
 * differs from the session default. */
export function TurnModeBadge({
  mode,
  prev,
  modal,
}: {
  mode?: PermissionMode;
  /** The previous turn's mode. Omit only when there is no previous turn. */
  prev?: PermissionMode;
  modal?: PermissionMode;
}) {
  if (!mode) return null;
  const reference = prev ?? modal;
  if (mode === reference) return null;
  return <span className={`badge ${modeClass(mode)}`}>{mode}</span>;
}
