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

/** Session-level mode pills: an accent "auto mode" pill when it was ever used, plus a neutral
 *  pill per other observed mode. Renders nothing for the common case (one default mode, never
 *  auto) — no point pilling the obvious. */
export function ModeBadges({
  modes = [],
  usedAutoMode,
}: {
  modes?: PermissionMode[];
  usedAutoMode?: boolean;
}) {
  const others = modes.filter((m) => m !== 'auto');
  if (!usedAutoMode && others.length === 0) return null;
  return (
    <div className="session-pills">
      {usedAutoMode && <span className="pill mode-auto">⚡ auto mode</span>}
      {others.map((m) => (
        <span key={m} className={`pill ${modeClass(m)}`}>
          {m}
        </span>
      ))}
    </div>
  );
}

/** Per-turn mode badge, rendered in the existing `.turn-role` gutter next to the `subagent`
 *  badge. Shown only when it differs from the session's modal mode — otherwise every turn
 *  carries an identical badge, which is noise, not signal. */
export function TurnModeBadge({
  mode,
  modal,
}: {
  mode?: PermissionMode;
  modal?: PermissionMode;
}) {
  if (!mode || mode === modal) return null;
  return <span className={`badge ${modeClass(mode)}`}>{mode}</span>;
}
