# Frontend (`web/`)

The visual system itself (tokens, component contracts, composition rules) is documented in
**`DESIGN.md` at the repo root**. This file is the engineering-side companion: the constraints,
the structure, and the things that will break if you "clean them up."

## The 4-runtime-dep budget

`web/package.json` `dependencies` (not `devDependencies`) is, and must stay, exactly:
```
react, react-dom, react-router-dom, @claudelens/shared
```
A deliberate ceiling (see `docs/architecture.md`'s rejected-alternatives table): no chart library
(hand-rolled SVG — `charts/Chart.tsx`, `charts/Donut.tsx`), no `react-query` (hand-rolled
`useFetch`), no UI kit, **no icon library** (hand-authored `components/Icon.tsx`). Adding a 5th
runtime dependency is against the project's stated design — if you think you need one, re-read the
rejected-alternatives list first.

## The `.js`-extension import rule (NodeNext)

All relative TypeScript imports inside `web/src` use a **`.js` extension on the import specifier**,
even though the source file is `.ts`/`.tsx` — e.g. `import { Shell } from '../components/Shell.js';`
importing from `Shell.tsx`. TypeScript requires the specifier to match the post-compilation name.
**Getting the extension wrong (or omitting it) is a build break**, not a lint nit. Grep any new file
for `from '\./` / `from '\.\./` and confirm every one ends in `.js`.

## Shell structure

The app is a **layout route**, not a per-page wrapper:

```
main.tsx
└── <Route element={<AppLayout/>}>        ← mounts ONCE, survives navigation
    ├── .sidenav       persistent rail: brand, routes, live team list, footer
    └── .app-main
        └── <Outlet/> → a page
            └── <Shell crumbs actions>    ← per-page: sticky topbar + .page container
```

Two consequences worth knowing before you edit either file:

- **`AppLayout` owns the single `/api/stats` request** and hands it down via the `useOrgStats()`
  context. Pages must read org totals from that hook rather than issuing their own duplicate
  request — that's the whole reason it's a layout route. `OverviewPage` does this.
- **`Shell` no longer renders the brand or the rail.** It renders the breadcrumb bar and the
  `<main id="main" class="page">` wrapper only. Its props (`crumbs`, `tagline`, `actions`,
  `children`) are unchanged from the pre-redesign version, so pages didn't need rewriting for it.

The rail is not a hamburger drawer. Under 1000px it becomes a horizontal scrolling strip above the
content (`Overview`/`Analytics` stay visible; the team list and footer hide). Navigation is never
more than one tap away at any width.

## CSS files

`web/src/styles.css` — tokens + core surfaces (shell, nav, page head, controls, bento, cards,
pills, lists, states, transcript, reduced-motion).
`web/src/styles.extra.css` — imported second in `main.tsx`; feature-scoped rules (dialog, tables,
charts, donut, model table).

All tokens are documented in `DESIGN.md`. Two that matter most often:

- **`--series-1`…`--series-8`, `--viz-grid`, `--viz-axis`** are the data-viz ramp. They were
  *referenced by `Chart.tsx` and `palette.ts` but defined in no stylesheet* until the redesign,
  which is why every chart rendered near-black on near-black. They are defined in `styles.css`
  now — don't remove them, and don't let a chart reach for a UI token instead.
- **The house UI tokens (`--accent`, `--user`, `--agent`, `--skill`, `--danger`) are NOT reusable
  as chart series colors.** They sit at OKLCH lightness 0.69–0.76, outside the 0.48–0.67 band the
  `--series-*` ramp was validated in against this dark ground. `--danger` in particular is never a
  series color at any lightness — it's reserved for destructive affordances, and a chart that uses
  it reads as "something is wrong" by association.

`palette.ts`'s `foldModels()` assigns `--series-N` slots in a **stable canonical order** (opus →
sonnet → haiku → other, alphabetical within a family) so changing the date range never repaints
which model is which color. Never assign chart colors by array index.

## Component inventory

| File | Purpose |
|---|---|
| `components/AppLayout.tsx` | Layout route: persistent rail + the one org-stats fetch + `useOrgStats()` context + skip link. |
| `components/Shell.tsx` | Per-page chrome: sticky breadcrumb bar (`crumbs`), `actions` slot, `.page` container. |
| `components/Icon.tsx` | The authored icon set — one 16×16 box, stroke 1.5, round caps/joins, `currentColor`. Add glyphs on the same geometry. Replaced the old `◑ ▸ ★ ⨯ ⚡` Unicode glyphs, which carried each font's own metrics and never aligned. |
| `components/Kpi.tsx` | `Kpi` (headline metric tile) + `KpiSkeleton` (same box while loading, so the band doesn't reflow). One tile per band may set `primary`. |
| `components/Stat.tsx` | `Stat` (in-card stat) and `Metric` (session-detail tile) — the shared implementation that deduplicated 4 copies. |
| `components/DataTable.tsx` | The one generic sortable `<table>` — contract below. |
| `components/SessionList.tsx` | Card-vs-table branch for `SessionSummary[]`, shared by `ProjectPage` and `UserPage`'s flat view. |
| `components/ViewToggle.tsx` | Segmented control. **`aria-pressed` drives the active styling**, so visual and a11y state cannot drift. |
| `components/ConfirmDialog.tsx` | Native `<dialog>` + `showModal()` wrapper. |
| `components/AccountLine.tsx` | `✉ email · Org` inline in `.session-sub`; `null` if both absent. |
| `components/ModeBadges.tsx` | `ModeBadges` (session pills), `TurnModeBadge` (per-turn, only when it differs from the session's modal mode), `modalMode(turns)`. |
| `charts/Chart.tsx` | Stacked area / stacked columns — API below. |
| `charts/Donut.tsx` | Share-of-total ring + legend. Arcs are stroked circle segments via `stroke-dasharray`, not filled wedges: no arc-flag maths, and a 100%-single-slice renders as a clean ring instead of a degenerate path. |
| `charts/palette.ts` | `foldModels()` (stable per-model color slots, folds tail + `<synthetic>` into "Other"), `modelActiveMs()` (coerces node-postgres's stringified bigints before arithmetic). |
| `useFetch.ts` | Data-fetching hook — contract below. |
| `usePref.ts` | URL-backed preference hook — contract below. |
| `api.ts` | All server calls. Bare-array response for `listSessions` (no `Page<T>` envelope — deliberate). |
| `format.ts` | `msgCount(stats)` (headline metric, never NaN), `fmtCost`, `fmtTokens`, `fmtDate`, `fmtDay` (parses `YYYY-MM-DD` as UTC explicitly), `fmtDuration`. |

## `useFetch` contract

```ts
function useFetch<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]): {
  data: T | null; err: string; loading: boolean; refetch: () => void;
}
```
Fetches on mount and whenever `deps` changes; aborts the in-flight request via `AbortController`;
**keeps the previous `data` visible while a refetch is in flight** (no loading-flash on refetch).
`refetch()` bumps an internal tick. ~40 lines — the explicit reason `react-query` wasn't added.

## `usePref` contract

```ts
function usePref(key: string, fallback: string): [string, (v: string) => void]
```
URL search param → `localStorage` → `fallback`; **the URL always wins**. The setter writes both
(with `{replace:true}`, so toggling a view doesn't pollute history) and **explicitly deletes the
`page` param** — changing a view resets pagination rather than pointing a stale offset at content
that may no longer be there. `localStorage` access is `try/catch`-wrapped.

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
Sort state is local; clicking a sortable header toggles asc→desc. `caption` is `.sr-only` but
present for screen readers; the table is wrapped in `.table-scroll` (`tabIndex`, `role="region"`).

If `sortable` is true but `sortValue` is omitted, sorting silently no-ops to `''` for every row
rather than throwing — a column that looks sortable but doesn't sort means `sortValue` was
forgotten.

**`.table-scroll` must never carry a non-`visible` `overflow` at desktop width.** See
`docs/gotchas.md` #4 — including the reprise, where `overflow: hidden` added purely for corner
radius re-parented the sticky `<thead>` and made it cover the first body row of every table.
Corners are rounded on the corner cells instead.

## `Chart.tsx` API

```tsx
<Chart kind="line" | "bars" labels={string[]} series={Series[]} height?={number} ariaLabel={string} />
interface Series { key: string; label: string; color: string; values: Array<number | null>; }
```
Hand-rolled inline SVG. `kind="line"` is a **stacked area** (not overlapping lines); `kind="bars"`
is **stacked columns**. Multiple series always stack on **one y-axis** — there is no dual-axis mode.
If two metrics need different scales, render two `<Chart>`s. Hard rule, not a current limitation.

- **The SVG measures its container with a `ResizeObserver`** and authors `viewBox` in real pixels,
  so one drawing unit is one CSS pixel at every width. It previously used `width="100%"` on a fixed
  `viewBox`, which letterboxed the drawing and centred it with dead gutters — `docs/gotchas.md` #8.
  Don't reintroduce a fixed `viewBox` width, and never use `preserveAspectRatio="none"` on anything
  containing text.
- Y-axis ticks follow a 1/2/5×10^k ladder (`niceTicks()`, exported for testing); an empty/all-zero
  series still returns a usable `[0,1]` axis rather than `NaN` bounds.
- Crosshair works by **pointer** and by **keyboard** (`←`/`→` step, `Escape` clears) on the
  focusable `<svg tabIndex={0}>`.
- `role="img"` + `aria-label`; `.chart-readout` (`role="status"`) surfaces the active point as text;
  `.chart-legend` renders only when `series.length >= 2`.

## Routing table (`main.tsx`)

All routes are children of the `AppLayout` layout route.

| Path | Page | Owns |
|---|---|---|
| `/` | `OverviewPage` | KPI band, team activity chart, model-mix ring, people table/cards, skills + tools. |
| `/analytics` | `AnalyticsPage` | Org-wide time series: KPI band, tokens/sessions/messages/cost, model ring + models table. |
| `/analytics/u/:author` | `AnalyticsPage` (same component, `author` scopes the `identity` filter) | Per-person analytics — **not** nested under `/u/:author/analytics`, because a project's route segment is `basename(cwd)` and a real project could be named `analytics`. |
| `/u/:author` | `UserPage` | One person: grouped-by-project (default) or flat sessions (`?view=`), each table/cards (`?layout=`). |
| `/u/:author/:project` | `ProjectPage` | One project under one author: its sessions, project-level delete. |
| `/session/:id` | `SessionPage` | One session's transcript: turns, tool calls, account/mode info, delete. |
