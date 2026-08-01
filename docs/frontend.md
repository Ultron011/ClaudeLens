# Frontend (`web/`)

## The 4-runtime-dep budget

`web/package.json` `dependencies` (not `devDependencies`) is, and must stay, exactly:
```
react, react-dom, react-router-dom, @claudelens/shared
```
This is a deliberate ceiling (see `docs/architecture.md`'s rejected-alternatives table): no chart library (hand-rolled SVG instead, see `Chart.tsx` below), no `react-query` (hand-rolled `useFetch` instead), no UI kit. Adding a 5th runtime dependency for anything is against the project's stated design — if you think you need one, that's a signal to re-read the rejected-alternatives list first.

## The `.js`-extension import rule (NodeNext)

All relative TypeScript imports inside `web/src` use a **`.js` extension on the import specifier**, even though the source file is `.ts`/`.tsx` — e.g. `import { Shell } from '../components/Shell.js';` importing from `Shell.tsx`. This is NodeNext module resolution: TypeScript requires the specifier to match what the file will be named *after* compilation, not the source extension. **Getting the extension wrong (or omitting it) is a build break**, not a lint nit — `tsc` will fail to resolve the module. Grep any new file you add for `from '\./` / `from '\.\./` and confirm every one ends in `.js`.

## CSS token system

`web/src/styles.css` defines the design tokens in `:root`, and `web/src/styles.extra.css` (imported second, in `main.tsx`, after `styles.css`) adds feature-scoped rules for the dialog, tables, and charts on top of them — one extra stylesheet rather than one per feature.

Core tokens (`styles.css:1-19`):
```css
--bg, --bg-elev, --bg-card         /* three-tier dark surface stack */
--border, --border-soft             /* two border weights */
--text, --text-dim, --text-faint    /* three-tier text emphasis */
--accent                            /* warm "Claude ember" #d68a4c, plus --accent-soft */
--user, --agent, --skill, --danger  /* role/semantic colors — turn roles, skill pills, delete actions */
--radius, --font, --mono
```

**`--topbar-h` is referenced but never defined.** `styles.extra.css:61` uses `top: var(--topbar-h)` to offset the sticky `<thead>` under the fixed topbar, but no `:root` block in either stylesheet actually sets `--topbar-h`. The topbar's height is hardcoded separately as `height: 64px` on `.topbar` (`styles.css:42`). Confirmed by grep — this is a real gap, not a documentation oversight: `var(--topbar-h)` with no fallback and no definition resolves to the property's initial value (`top: auto`), so the sticky table header's offset is currently *not* actually pinned to 64px via the custom property the code implies it is. If you touch the topbar height or the sticky table header, either add `--topbar-h: 64px;` to `:root` or stop relying on the variable — don't assume it already works because the CSS reads as if it does.

**Chart series palette** (`styles.extra.css` doesn't define these either — check `web/src/charts/Chart.tsx`/`palette.ts` and the plan at `/home/soul/.claude/plans/calm-tumbling-hanrahan.md §7` for the intended values):
```css
--series-1:#3987e5; --series-2:#d95926; --series-3:#199e70; --series-4:#c98500;
--series-5:#d55181; --series-6:#008300; --series-7:#9085e9; --series-8:#e66767;
--viz-grid:#22252b; --viz-axis:#33373f;
```
**The house UI tokens (`--accent`, `--user`, `--agent`, `--skill`, `--danger`) are NOT reusable as chart series colors.** They all sit at OKLCH lightness 0.69–0.76, outside the 0.48–0.67 band validated against this app's dark background (`#0d0f13`); reusing them as series fill/stroke would fail the same contrast/CVD-distinctness validation the dedicated `--series-*` ramp was built to pass. `--danger` in particular must never be used as a series color even off-palette — it's reserved for destructive-action affordances (delete chips, danger pills) and reusing it as a data color would make a chart read as "something is wrong" by association. `web/src/charts/palette.ts`'s `foldModels()` assigns `--series-N` slots in a **stable, canonical order** (opus → sonnet → haiku → other, alphabetical within a family) specifically so that changing a date-range filter never repaints which model gets which color — never assign chart colors by array index / sort-of-the-moment.

## Component inventory

| File | Purpose |
|---|---|
| `components/Shell.tsx` | App chrome: sticky topbar with brand + breadcrumb trail (`crumbs` prop) + optional `actions` slot. Every page wraps its content in `<Shell>`. |
| `components/Stat.tsx` | `Stat` (card-stat tile, used inside `.card-stats`) and `Metric` (detail-page tile, used inside `.session-stats`) — the single shared implementation deduplicating what used to be 4 copies across `OverviewPage`, `UserPage`, `ProjectPage`, `SessionPage`. |
| `components/DataTable.tsx` | The one generic sortable `<table>` — see contract below. |
| `components/SessionList.tsx` | Card-vs-table branch for a list of `SessionSummary[]`, shared by `ProjectPage` and `UserPage`'s flat view — the branch logic lives here exactly once. |
| `components/ViewToggle.tsx` | Generic 2+-button segmented control (`role="group"`, `aria-pressed`) — used for both card/table and grouped/flat toggles. |
| `components/ConfirmDialog.tsx` | Native `<dialog>` + `showModal()` wrapper — see below. |
| `components/AccountLine.tsx` | Renders `✉ email · Org` inline inside `.session-sub`; returns `null` if both are absent. |
| `components/ModeBadges.tsx` | `ModeBadges` (session-level pills: accent "⚡ auto mode" + neutral pills for other observed modes), `TurnModeBadge` (per-turn badge, rendered only when it differs from the session's `modalMode()`), and `modalMode(turns)` (most-frequent `permissionMode` across a session's turns). |
| `charts/Chart.tsx` | The one chart component — see API below. |
| `charts/palette.ts` | `foldModels()` (stable per-model color slot assignment, folds tail + `<synthetic>` into "Other"), `modelActiveMs()` (coerces node-postgres's stringified bigint/numeric before arithmetic). |
| `useFetch.ts` | Data-fetching hook — see contract below. |
| `usePref.ts` | URL-backed preference hook — see contract below. |
| `api.ts` | All server calls: `listSessions`, `getSession`, `getStats`, `getAnalytics`, `patchSession`, `deleteSession`, `deleteProject`. Bare-array response for `listSessions` (no `Page<T>` envelope — deliberate, see architecture doc). |
| `format.ts` | `msgCount(stats)` (the headline metric — `userMessages ?? userTurns ?? 0`, never NaN), `fmtCost`, `fmtTokens`, `fmtDate`, `fmtDay` (parses `YYYY-MM-DD` as UTC explicitly — see below), `fmtDuration`. |

## `useFetch` contract

```ts
function useFetch<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]): {
  data: T | null; err: string; loading: boolean; refetch: () => void;
}
```
Fetches on mount and whenever `deps` changes; aborts the in-flight request via `AbortController` on unmount or the next dep change; **keeps the previous `data` visible while a refetch is in flight** (no loading-flash on refetch, only on first mount, since `data` starts `null`). `refetch()` bumps an internal tick to re-run `fn` without changing `deps`. ~40 lines total — the explicit reason a 5th dependency (`react-query`) wasn't added: mutations here need to invalidate specific lists, which this hook's `refetch()` already covers directly.

## `usePref` contract

```ts
function usePref(key: string, fallback: string): [string, (v: string) => void]
```
A view preference backed by a URL search param, falling back to `localStorage`, falling back to `fallback` — **the URL always wins** over localStorage. Precedence: `params.get(key) ?? localStorage.getItem('claudelens.'+key) ?? fallback`. Calling the setter writes both the URL (via `setSearchParams(..., {replace:true})`, so toggling a view doesn't pollute browser history) and localStorage, and **explicitly deletes the `page` param** — changing a view preference (e.g. cards→table) resets pagination rather than leaving a stale page number pointed at content that may no longer exist at that offset. `localStorage` access is wrapped in `try/catch` (private-mode/disabled-storage safe).

## Card-with-stretched-link pattern

Every card (`SessionCard` in `SessionList.tsx`, and the equivalent in `OverviewPage`/`UserPage`) is `<article className="card">` containing a `<Link className="card-link" />` absolutely positioned with `inset: 0` and `z-index: 1`, **not** the whole card wrapped in a single `<Link>`. Reason: cards also contain a delete button (and other interactive chips) — nesting a `<button>` inside an `<a>`/`<Link>` is invalid nested interactive content (fails accessibility and produces inconsistent click-target behavior across browsers). The pattern instead:
- `.card-content` (title, meta, stats, pills) sits at the default stacking order with `pointer-events: none` so clicks pass through to the stretched link beneath it.
- `.card-actions` (and `.card-skills`, `.card-tags`, `.card-meta`) are `position: relative; z-index: 2; pointer-events: auto`, so they sit *above* the stretched link and remain independently clickable.
This is why you'll see `pointer-events: none` on `.card-content` in `styles.css` — it isn't decorative, it's what makes the stretched-link click-through work at all.

## `DataTable` `Column<T>` contract

```ts
interface Column<T> {
  key: string;
  header: ReactNode;
  numeric?: boolean;                       // right-aligns + tabular-nums via .num
  sortable?: boolean;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number; // required when sortable is true
}
```
`DataTable<T>({ columns, rows, rowKey, caption, ariaLabel })` renders exactly one generic sortable `<table>`, used for every list on the site (sessions, people, projects, models). Sort state is local (`{key, dir}`); clicking a sortable header's `<button class="th-sort">` toggles asc→desc→asc. `caption` is visually hidden (`.sr-only`) but present in the DOM for screen readers; the whole table is wrapped in `<div class="table-scroll" tabIndex={0} role="region" aria-label={ariaLabel}>` so keyboard users can scroll it horizontally without a pointer. See `docs/gotchas.md` #4 and #5 for why `.table-scroll` doesn't set `overflow-x` except under a 720px breakpoint, and why `.layout > .content` needs `min-width: 0`.

If `sortable` is true but `sortValue` is omitted, sorting that column silently no-ops to `''` for every row (falls back to `?? ''` in `DataTable.tsx`) rather than throwing — a column that looks sortable but doesn't actually sort is a sign `sortValue` was forgotten, not a runtime error to chase.

## `Chart.tsx` API

```tsx
<Chart kind="line" | "bars" labels={string[]} series={Series[]} height?={number} ariaLabel={string} />
interface Series { key: string; label: string; color: string; values: Array<number | null>; }
```
One file (~210 lines), hand-rolled inline SVG — no chart library (see the 4-dep budget above). `kind="line"` renders a **stacked area** (not separate overlapping lines); `kind="bars"` renders **stacked columns**. Multiple series always stack on **one y-axis** — there is no dual-axis mode; if two metrics need genuinely different scales (e.g. tokens vs. cost), render two separate `<Chart>`s, never one chart with two axes (this is a hard rule from the build plan, not just a current limitation).

- Y-axis ticks follow a 1/2/5×10^k "nice ticks" ladder (`niceTicks()`, exported for testing); an empty/all-zero series still returns a usable `[0,1]` axis rather than `NaN` bounds.
- Crosshair works by **pointer** (`onPointerMove`/`onPointerLeave`) and by **keyboard** (`ArrowLeft`/`ArrowRight` to step, `Escape` to clear) on the focusable `<svg tabIndex={0}>`.
- `role="img"` + `aria-label` on the `<svg>`; a `.chart-readout` (`role="status" aria-live="polite"`) surfaces the active point's values as text for screen readers and sighted users alike; a `.chart-legend` only renders when `series.length >= 2`.
- `charts/palette.ts`'s `foldModels()` is the thing that turns a raw `AnalyticsModel[]` into `ModelRow[]` with a stable `color` per row before handing series to `<Chart>` — always route model data through it rather than assigning colors ad hoc.

## Routing table (`main.tsx`)

| Path | Page | Owns |
|---|---|---|
| `/` | `OverviewPage` | Org-wide totals, the people leaderboard/table, skill/tool clouds. Entry point. |
| `/analytics` | `AnalyticsPage` | Org-wide time-series: KPI tiles, tokens/messages/cost/sessions per day, the models table. |
| `/analytics/u/:author` | `AnalyticsPage` (same component, `author` param scopes the `identity` filter) | Per-person analytics — **not** nested under `/u/:author/analytics`, because a project's route segment is `basename(cwd)` and a real project could literally be named `analytics`, which would collide. |
| `/u/:author` | `UserPage` | One person: grouped-by-project view (default) or flat all-sessions view (`?view=`), each with a card/table layout toggle (`?layout=`). |
| `/u/:author/:project` | `ProjectPage` | One project under one author: its sessions (card/table), project-level delete. |
| `/session/:id` | `SessionPage` | One session's full transcript: turns, tool calls, account/mode info, session-level delete. |

`AnalyticsPage` is the **sole `main.tsx`/routing writer** for the analytics feature per the build plan (§7) — if you're adding an analytics-adjacent route, it belongs there, not scattered across other pages.
