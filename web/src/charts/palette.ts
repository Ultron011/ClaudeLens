import type { AnalyticsModel } from '../api.js';

const FAMILIES = ['opus', 'sonnet', 'haiku'];
const MAX_SLOTS = 6;
export const OTHER_COLOR = 'var(--text-faint)';

function familyRank(model: string): number {
  const m = model.toLowerCase();
  const i = FAMILIES.findIndex((f) => m.includes(f));
  return i === -1 ? FAMILIES.length : i;
}

export type ModelRow = AnalyticsModel & { color: string };

/** Postgres returns bigint/numeric as strings via node-postgres, so coerce before any math —
 *  otherwise `+` silently concatenates. */
export function modelActiveMs(m: AnalyticsModel): number {
  return Number(m.activeMs ?? 0);
}

/**
 * Assigns each model a stable `--series-N` slot in canonical family order (opus → sonnet →
 * haiku → other), independent of the API's active-time-sorted row order — so switching the date
 * range never repaints a model that's still present. `<synthetic>` (Claude Code's injected-
 * message model id, e.g. API-error turns) and anything past the 6th slot fold into one "Other"
 * row rather than a 9th hue. The server's `daily` rows have no per-model breakdown (only
 * `models` does), so this fold applies to the models table, not a per-day chart.
 */
export function foldModels(models: AnalyticsModel[]): { rows: ModelRow[]; other: ModelRow | null } {
  const real = models.filter((m) => m.model !== '<synthetic>');
  const synthetic = models.filter((m) => m.model === '<synthetic>');
  const canonical = [...real].sort((a, b) => familyRank(a.model) - familyRank(b.model) || a.model.localeCompare(b.model));
  const slot = new Map(canonical.slice(0, MAX_SLOTS).map((m, i) => [m.model, `var(--series-${i + 1})`]));

  const rows = models.filter((m) => slot.has(m.model)).map((m) => ({ ...m, color: slot.get(m.model)! }));
  const overflow = [...real.filter((m) => !slot.has(m.model)), ...synthetic];
  if (overflow.length === 0) return { rows, other: null };

  const other = overflow.reduce<ModelRow>(
    (acc, m) => ({
      model: 'Other',
      sessions: acc.sessions + m.sessions,
      turns: acc.turns + m.turns,
      activeMs: Number(acc.activeMs) + modelActiveMs(m),
      tokens: Number(acc.tokens) + Number(m.tokens),
      cost: String(Number(acc.cost ?? 0) + Number(m.cost ?? 0)),
      measured: acc.measured && m.measured,
      color: OTHER_COLOR,
    }),
    { model: 'Other', sessions: 0, turns: 0, activeMs: 0, tokens: 0, cost: '0', measured: true, color: OTHER_COLOR },
  );
  return { rows, other };
}
