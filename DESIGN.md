---
name: ClaudeLens
description: A team's Claude Code usage read as an instrument panel — light green-tinted grey ground, white cards, one deep emerald accent, an unequal bento.
colors:
  bg: "#f3f5f3"
  bg-sunken: "#e9ece9"
  sidebar-bg: "#ffffff"
  bg-elev: "#f4f6f4"
  bg-card: "#ffffff"
  bg-raised: "#f6f8f6"
  border: "#e0e4df"
  border-soft: "#e9ece8"
  border-strong: "#cdd3cb"
  text: "#14181a"
  text-dim: "#5a6560"
  text-faint: "#6b7671"
  accent: "#157551"
  accent-hover: "#0f6244"
  accent-strong: "#157551"
  accent-ink: "#ffffff"
  accent-soft: "rgba(21, 117, 81, 0.09)"
  accent-line: "rgba(21, 117, 81, 0.28)"
  ink: "#14181a"
  ink-soft: "rgba(20, 24, 26, 0.06)"
  bubble-me: "color-mix(in srgb, var(--accent) 11%, var(--bg-card))"
  bubble-me-line: "color-mix(in srgb, var(--accent) 26%, var(--bg-card))"
  skill: "#157551"
  danger: "#b8332a"
  danger-soft: "rgba(184, 51, 42, 0.08)"
  success: "#157551"
  warning: "#96600c"
  series-1: "#2f6fd0"
  series-2: "#bc4a1c"
  series-3: "#12805a"
  series-4: "#8f6200"
  series-5: "#b23e69"
  series-6: "#3d7d34"
  series-7: "#6354ca"
  series-8: "#bd4040"
  viz-grid: "#ebeee9"
  viz-axis: "#d4d9d1"
typography:
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif"
  monoFamily: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace"
  scale:
    fs-2xs: "10px"
    fs-xs: "11px"
    fs-sm: "12px"
    fs-md: "13px"
    fs-base: "14px"
    fs-lg: "15px"
    fs-xl: "17px"
    fs-2xl: "20px"
    fs-3xl: "24px"
    fs-4xl: "30px"
  weights: [500, 550, 600, 620, 650, 680]
radius:
  r-xs: "4px"
  r-sm: "6px"
  r-md: "10px"
  r-lg: "14px"
  r-xl: "18px"
  r-full: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "20px"
  s6: "24px"
  s7: "32px"
  s8: "40px"
  s9: "56px"
---

# Design System: ClaudeLens

Ground truth is `web/src/styles.css` (tokens + core surfaces) and `web/src/styles.extra.css`
(dialog, tables, charts, donut), imported in that order from `main.tsx`. This file describes what
those files actually do. Where they disagree with this file, they win — fix this file.

## Overview

An internal, desktop-first tool for browsing a team's Claude Code sessions **person → project →
session → transcript**. Visitor mode is **Operate**: the reader is doing a task, so scanability,
density and familiar affordances outrank expression. Brand lives in precision — tabular numerals,
tight alignment, one accent used only where it means something.

The world: a soft green-tinted grey page with **white cards that lift on a shadow**, a white rail,
and one deep emerald for selection and the primary metric. Derived from the pinned references
`references/dribble-ref-01` and `-02`.

`PRODUCT.md` records the same commitment (principle 5) and keeps the superseded "dark surface +
Claude-ember" wording visible as a recorded reversal, so the change reads as a decision rather than
as drift.

## Colors

### Surfaces

| Token | Value | Use for |
|---|---|---|
| `--bg` | `#f3f5f3` | The page. Never a card. |
| `--bg-sunken` | `#e9ece9` | Recessed wells: segmented-control track, `.empty` dashed panel, dialog input. |
| `--sidebar-bg` | `#ffffff` | The rail only — the second neutral layer for chrome. |
| `--bg-card` | `#ffffff` | Panels, cards, dialogs, table body, the segmented thumb. |
| `--bg-elev` | `#f4f6f4` | **Inset furniture** on top of white: chips, pills, tool-call rows, table headers, code blocks. |
| `--bg-raised` | `#f6f8f6` | Hover only: table rows, nav items, leaderboard rows. |

**The Card-vs-Furniture Rule.** `--bg-card` and `--bg-elev` are deliberately different values on
light, where in a dark stack they were one. If a surface *holds* content it is `--bg-card` (white);
if it *sits on* content it is `--bg-elev` (grey). A chip on `--bg-card` vanishes; a dialog on
`--bg-elev` reads recessed.

**Cards lift, they don't tint.** `.card:hover` changes `box-shadow` and `border-color`, never
`background`. Swapping a white card to grey on hover reads as *disabled*.

### Text

| Token | Value | Contrast on white | Use for |
|---|---|---|---|
| `--text` | `#14181a` | 15.9:1 | Body, headings, values, table links. |
| `--text-dim` | `#5a6560` | 6.0:1 | Secondary prose: `.lede`, `.card-note`, legend labels. |
| `--text-faint` | `#6b7671` | 4.8:1 | Tertiary: labels, counts, axis ticks, `.panel-sub`. |

**The Three-Tier Rule.** Three tiers, all clearing 4.5:1 on **both** `--bg-card` and `--bg-raised`
— the hover surface is the one that is easiest to get wrong, because it only fails while a user is
pointing at it. There is no fourth, lighter tier. If text needs to recede further, it should not be
on the page.

### Accent

`--accent` (`#157551`) is a **deep** emerald, not a bright one: on a light ground the accent carries
text and icon contrast (5.8:1 on white), so it sits at the dark end of its hue.

**The One-Accent Rule.** The accent appears only on: current nav selection (`[aria-current]`), the
one primary KPI tile, focus rings, `.chip.on`, skill pills, table-link hover, `.tc-name`, and the
single-series chart hue. Never as decoration, a divider, or a background wash.

**The One-Solid-Tile Rule.** Exactly one `.kpi` per band carries `is-primary` — a solid
`--accent-strong` fill with `--accent-ink` (white) text, after ref-01's "Total Projects" tile. Two
filled tiles in a band means the hierarchy was not decided. Secondary text on that fill is tinted
from the fill's own hue via `color-mix`, never grey.

### Semantic hues

**Three voices only: emerald, the neutrals, and ink.** There is no blue and no violet. The palette
previously carried a blue `--user` and a violet `--agent` inherited from the dark build; in a
green/white world those read as three unrelated hues competing for one job, so both were retired.
`references/dribble-ref-01` does the same — green, white, black, and status colours.

- `--skill` is the accent. Skills are the product's subject ("which prompts, skills and subagents
  work"), not an arbitrary extra hue.
- `--ink` / `--ink-soft` carry everything that must differ from a skill without shouting: subagent
  pills, the `plan` mode pill, the `subagent` tag, the subagent avatar.
- **Status only, never decorative:** `--warning` (amber) on the `auto mode` pill, because that is an
  elevated-permission state and amber says so honestly; `--danger` (red) on destructive actions.

**The rule for a new role colour:** there isn't one. Differentiate by surface, fill, or ink weight.
Adding a hue is how the dark palette accumulated a blue and a violet nobody had designed for.

### Data-viz

**The Two-Palette Rule.** There are two colour systems and they never mix.

1. **`--viz-primary`** (= `--accent`) is the single-series hue. **Every chart with one series uses
   this and only this.** Hue cannot encode anything when there is nothing to distinguish, so four
   charts in four colours is decoration — and all four pinned references avoid it (ref-01 is
   all-green, ref-03 all-yellow, ref-04 monochrome).
2. **`--series-1..8`** is the categorical ramp, reserved for marks where a category genuinely
   exists: the model donut and the models table. Retuned for the light ground so a 2px stroke or an
   8px legend dot clears 3:1 on white. `charts/palette.ts` reaches slots 1–6 only
   (`MAX_SLOTS = 6`, tail folded into "Other"); 7 and 8 are spare.

UI tokens are never series colours, and **`--danger` is never a series colour at any lightness** —
a chart drawn in it reads as "something is wrong" by association.

`foldModels()` assigns slots in a stable canonical order (opus → sonnet → haiku → other,
alphabetical within family) so changing the date range never repaints which model is which colour.
**Never assign chart colours by array index.**

Two magnitude bars (`.bar-fill`, `.leaderboard .lb-bar span`) do use `--skill`/`--accent`. That is
allowed: they are single-magnitude indicators, not categorical series, so the ramp's distinctness
guarantee is irrelevant to them.

## Typography

One family — a system UI stack. Product UI does not need display/body pairing; hierarchy comes from
size, weight and tracking.

### The ramp

Ten steps, **no half-pixels**. Anything off this ramp is a bug.

| Token | Size | Role |
|---|---|---|
| `--fs-2xs` | 10px | Micro labels: `.stat-label`, turn `.badge`, sort arrow. |
| `--fs-xs` | 11px | Uppercase labels, pills, nav counts, table headers. |
| `--fs-sm` | 12px | Meta, `.panel-sub`, legends, transcript code. |
| `--fs-md` | 13px | Dense UI: table cells, chips, crumbs, `.lede`. |
| `--fs-base` | 14px | Body. |
| `--fs-lg` | 15px | Panel and card titles. |
| `--fs-xl` | 17px | Detail metric values. |
| `--fs-2xl` | 20px | Donut centre value. |
| `--fs-3xl` | 24px | Session title. |
| `--fs-4xl` | 30px | KPI value, page `h1`. |

This replaced 19 sizes including six half-pixel steps (9.5/10.5/11.5/12.5/13.5/15.5) that read
identically to their neighbours and made the scale unauditable.

Weights: 500 (nav, links), 550–600 (labels, headers), 620–680 (titles, values). Tracking goes
negative as size grows (`-0.012em` at 15px → `-0.035em` at 30px), floor `-0.04em`.

**The Section-Title Rule.** Panel titles are `--fs-lg` (15px) — they must outrank the 14px body
beneath them. At 13px the hierarchy inverted and a heading read as smaller than its own contents.

**The Tabular-Numerals Rule.** `font-variant-numeric: tabular-nums` on every number that can
change: KPI values, stat/metric values, table `.num` cells, axis ticks, counts, donut centre. A
number that shifts width as it updates is a number the reader cannot compare down a column.

**The Uppercase-Label Rule.** Uppercase + `letter-spacing: 0.06em` is for **data labels and nav
group headers only** (`.kpi-label`, `.stat-label`, `.metric-label`, `thead th`, `.nav-label`). It is
never a kicker or eyebrow above a heading — headings carry their own weight.

Body prose is capped at `68ch` (`.lede`) / `52ch` (`.empty p`). `text-wrap: balance` on `h1`,
`pretty` on prose.

## Layout

### App shell

```
main.tsx
└── <Route element={<AppLayout/>}>       ← mounts ONCE, survives navigation
    ├── .sidenav      248px sticky rail: brand, routes, live team list, footer
    └── .app-main
        └── <Outlet/> → page
            └── <Shell crumbs actions>   ← sticky topbar (60px) + .page container
```

The rail is a **layout route**, not a per-page wrapper, so it never remounts or flickers, and the
one `/api/stats` request lives there and is shared via `useOrgStats()`.

`.page` is `max-width: 1480px`, padded `--s6 --s7 --s9`.

### The bento

`.bento` is a 12-column grid, `gap: --s4`. Children take `.col-3` … `.col-12`.

**The Unequal-Composition Rule.** Cells must be deliberately different sizes. A bento whose
children all share one span is a card grid wearing a grid's name.

| Page | Composition |
|---|---|
| Overview | KPI band (4) → `col-8` activity chart + `col-4` model ring → `col-8` people + `col-4` stack (skills, tools) |
| Analytics | KPI band (4) → `col-12` tokens → `col-6` + `col-6` (sessions, messages) → `col-7` cost + `col-5` ring → `col-12` models table |
| User | KPI band (4) → `col-9` projects/sessions + `col-3` skills |
| Project | KPI band (4) → `col-9` sessions + `col-3` stack (skills used here, models) |
| Session | Single `900px` column — a transcript is prose, not a dashboard. Header, a labelled `<dl>` of facts, then the bubble transcript |

**The No-Nested-Card Rule.** A bordered surface inside a bordered surface is always wrong. This is
why Overview's People section and User's Projects section are a bare `<section class="col-8">` with
a `.panel-head` above them, not a `.panel` — the table and the card grid already carry their own
bordered surface.

### Breakpoints

Responsive behaviour is **structural**, never fluid type.

| Width | What changes |
|---|---|
| ≤ 1180px | `col-3/4/5` → span 6; `col-7/8/9` → span 12. |
| ≤ 1000px | The rail becomes a horizontal scrolling strip above the content. Brand, routes **and people** stay; the `TEAM` label, per-person counts and footer hide. No hamburger, no drawer — navigation is one tap away at every width. |
| ≤ 720px | Every bento child spans 12. `.table-scroll` gains `overflow-x` and the first column pins. Page padding tightens. |

### Spacing

`--s1: 4px` … `--s9: 56px`. Tight within a group, generous between groups; more space above a
heading than below it.

## Elevation & Depth

Tonal layering carries most of the depth (`--bg` → `--bg-card`); shadow adds the lift.

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(22,38,30,.05)` | Card at rest, segmented thumb. |
| `--shadow-md` | `0 2px 8px -2px rgba(22,38,30,.08)` | Card on hover. |
| `--shadow-lg` | `0 18px 48px -12px rgba(22,38,30,.22)` | Dialog. |

Every shadow has a **y-offset and a soft blur**, and is tinted with the ground's green rather than
pure black — a black shadow on a tinted light ground reads grey and dirty. A zero-offset coloured
halo is decoration, not depth.

**The Named-Layer Rule.** z-index comes only from the semantic scale — `--z-base: 1`,
`--z-sticky: 20`, `--z-sidebar: 30`, `--z-topbar: 40`, `--z-backdrop: 50`, `--z-modal: 60`,
`--z-toast: 70`. Never a literal, never 9999.

## Shapes

| Token | Value | Use |
|---|---|---|
| `--r-xs` | 4px | Focus-ring rounding, turn badge. |
| `--r-sm` | 6px | Pills, tool-call rows, segmented thumb. |
| `--r-md` | 10px | Chips, nav items, notices, dialog input. |
| `--r-lg` | 14px | Cards, panels, tables, dialogs. |
| `--r-full` | 999px | Tags, bar tracks. |

Borders are 1px, always. `--border-soft` for structure at rest, `--border` for definition,
`--border-strong` for hover. **A coloured `border-left`/`border-right` above 1px is never used.**

### Icons

**The Authored-Icon Rule.** All icons are hand-drawn in `components/Icon.tsx` on a **16×16 box,
stroke 1.5, round caps and joins, `currentColor`, `fill: none`** (only `star` fills, and only when
`filled`; `caretUp`/`caretDown` are solid because a stroked chevron turns to mush at 9px).

There is **no icon dependency** — `web` has a 4-runtime-dep budget. Unicode glyphs are not an icon
system: they carry each font's own weight, baseline and metrics, so they never align with each other
or with adjacent text. The old `◑ ▸ ★ ⨯ ⚡ ▲ ▼` were all replaced. (One remains: `✉` in
`AccountLine.tsx`.)

`Logo` is the two-tone brand mark on the same grid: a lens ring in `currentColor` plus a filled
quadrant and centre dot in `--accent`. It reads as an aperture (a *lens* on the team's sessions) and
as one slice of a ring chart (what the dashboard shows). `web/public/favicon.svg` is the same mark
and **must be kept in step**.

## Components

| Component | Contract |
|---|---|
| `AppLayout` | Layout route: rail + the one org-stats fetch + `useOrgStats()` + skip link. |
| `Shell` | Sticky breadcrumb bar (`crumbs`, `tagline`, `actions`) + `<main class="page">`. |
| `Icon` / `Logo` | The icon system above. `IconName` is the closed set. |
| `Kpi` / `KpiSkeleton` | Label row (icon + uppercase label) → value → `foot`. `primary` = the solid tile. `foot` carries context, **never a fabricated trend delta** — the API supplies no period-over-period change and inventing one would be a claim the data can't back. The skeleton is the same box, so the band never reflows. |
| `Stat` / `Metric` | In-card stat and detail-page metric. One shared implementation. |
| `DataTable` | The one generic sortable table. `Column<T>` needs `sortValue` whenever `sortable`. `caption` is `.sr-only`; wrapper is `role="region"` + `tabIndex`. `aria-sort` on every sortable header. |
| `SessionList` | Card-vs-table branch for `SessionSummary[]`. |
| `ViewToggle` | Segmented control on an inset track. **`aria-pressed` drives the visual state**, so visual and a11y state cannot drift. |
| `ConfirmDialog` | Native `<dialog>` + `showModal()`, with type-to-confirm for project deletes. |
| `ModeBadges` | Session-level mode pills — **currently unrendered**, the session page's `Mode` fact row was cut as low-value for its height. Kept for a future header. |
| `TurnModeBadge` | A **transition marker**, rendered only when a turn's mode differs from the *previous turn's*. Comparing against the session's modal mode instead badges every turn in the minority mode, which on a real 388-turn two-mode session meant a badge on roughly half the bubbles. Unknown modes fall back to `.mode-other` — legible, never blank. |
| `Chart` | Stacked area (`line`) or stacked columns (`bars`), one y-axis, never dual-axis. |
| `Donut` | Share-of-total ring + legend. Arcs are stroked circle segments via `stroke-dasharray`, not filled wedges — no arc-flag maths, and a 100% single slice renders as a clean ring instead of a degenerate path. |
| `TurnText` | Transcript body. Splits on ``` and renders fenced blocks as `.turn-code`. **Not a markdown renderer** — deliberately, given the dep budget. Fences are the one construct that actively hurts legibility raw. |

### The transcript

A chat-bubble layout: the person's turns right-aligned in a soft emerald bubble
(`--bubble-me`, capped at `min(78%, 560px)` so the ragged right edge stays scannable), Claude's
left-aligned in white and taking the full column, since those carry the code blocks and tool rows.

- **Side and fill carry the role, so no name repeats per turn.** An icon avatar identifies the
  speaker (`person` / `lens` / `people` for a subagent) and the real name ships to assistive tech in
  a `.sr-only` span — alignment and hue mean nothing to a screen reader.
- The **one squared corner** nearest the avatar is the tail. A CSS-triangle pseudo-element leaves a
  visible seam against a bordered bubble; this reads as the same gesture with no artifact.
- **Claude's avatar is the one solid-emerald chip on the page** — it marks the agent's voice down
  the whole left edge. A subagent's is solid ink: still Claude, not the main voice.
- **Inset furniture flips surface with its bubble.** Claude's bubble is white → code blocks and tool
  rows are grey (the base rule). The user's bubble is emerald-tinted and a subagent's is grey → both
  need *white* furniture, because grey-on-grey is a 1-value difference and effectively invisible.
  Getting this backwards makes code blocks vanish.

The emerald bubble is not a costume borrowed from a messaging app. This palette is already green, so
the familiar "my messages are the tinted ones" convention lands for free instead of importing a hue.

### Cards and the stretched link

Every card is `<article class="card">` containing an absolutely-positioned
`<Link class="card-link">` — **not** a card wrapped in a `<Link>`, because cards also hold delete
buttons and a `<button>` inside an `<a>` is invalid nested interactive content.

- `.card-content` is `pointer-events: none` so clicks fall through to the stretched link.
- `.card-actions`, `.card-skills`, `.card-tags`, `.card-meta` are `z-index: 2` +
  `pointer-events: auto` so they stay independently clickable.

The `pointer-events: none` is load-bearing, not decorative.

### States

Every interactive element has default / hover / focus-visible / active / disabled. Hover-revealed
controls (`.card-actions`, `.row-action`) have an `@media (hover: none)` fallback that keeps them
visible on touch, and resolve on `:focus-within` for keyboard.

- **Loading** is skeletons (`.skel`) shaped like the final content, never a centred spinner.
- **Empty** states teach the flow — they name the slash command that produces data, rather than
  saying "nothing here".
- **Error** states name the problem and stay in place.

## Do's and Don'ts

**Do**
- Put every number that can change on tabular numerals.
- Use one solid accent tile per KPI band, and one accent hue per single-series chart.
- Reach for `--bg-elev` for anything that sits *on* a card.
- Give a new bento cell a span that differs from its neighbours.
- Draw new icons on the 16×16 / stroke-1.5 grid.

**Don't**
- Add a 5th runtime dependency to `web` (see Implementation Constraints).
- Use a UI hue as a chart series colour, or `--danger` as one ever.
- Nest a bordered surface inside a bordered surface.
- Put an uppercase tracked label above a heading.
- Introduce a font size or radius that is not on the ramps above.
- Tint a card on hover instead of lifting it.

## Motion

| Token | Value |
|---|---|
| `--ease` | `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out-quart) |
| `--ease-soft` | `cubic-bezier(0.33, 1, 0.68, 1)` (ease-out-cubic) |
| `--t-fast` | 120ms — colour and opacity |
| `--t` | 180ms — card lift, hover-revealed actions |
| `--t-slow` | 260ms — donut arc growth |

Exponential ease-out, no bounce, no elastic. Motion conveys state only: hover lift, focus, reveal,
skeleton shimmer, donut arcs settling. No page-load choreography — the reader arrived to do a task.

**The Reduced-Motion Rule.** `@media (prefers-reduced-motion: reduce)` collapses all durations,
cancels the card's `translateY`, and turns the skeleton shimmer into a **flat tint** rather than a
single flash. Every animation has a still alternative; none is left running.

## Implementation Constraints

- **`web` has exactly 4 runtime dependencies**: `react`, `react-dom`, `react-router-dom`,
  `@claudelens/shared`. No chart library (hand-rolled SVG), no UI kit, no icon library, no
  data-fetching library (hand-rolled `useFetch`). A 5th dep is against the project's design.
- **Every relative TS import ends in `.js`** (NodeNext). Wrong extension = build break.
- **`.table-scroll` must never set a non-visible `overflow`** — not `auto`, not `hidden`, not even
  "just for the border radius". Any non-visible overflow makes it the containing block for the
  sticky `<thead>`, which then pins `--topbar-h` below the *table's* top edge and paints over the
  first body row. Corners are rounded on the four corner cells instead. See `docs/gotchas.md` #4.
- **`.tool-call` needs its explicit `grid-column` assignments and `.tc-args` needs `min-width: 0`.**
  `.tc-detail` renders conditionally, and without explicit columns grid auto-placement slides
  `.tc-args` into a bare `auto` track; without `min-width: 0` a grid item's automatic minimum is its
  content's min-content size, so a 300-char command never truncates. Both are load-bearing.
- **`Chart` measures its container with a `ResizeObserver`** (synchronously first, then observed)
  and authors `viewBox` in real pixels, so one drawing unit is one CSS pixel. It previously set
  `width="100%"` on a fixed `viewBox`, which letterboxed the drawing and centred it with dead
  gutters. Never use `preserveAspectRatio="none"` on anything containing text. See
  `docs/gotchas.md` #8.
- **`.chart-readout` is always in the DOM**, empty when there is no active point. Rendering it
  conditionally made it appear on first hover and shove every panel below it down the page.
- **Day buckets are UTC**, computed once in the parser. `fmtDay` parses `YYYY-MM-DD` as UTC
  explicitly.

## Adding to This System

- **A token**: add it to `:root` in `styles.css` with a comment saying what it is *for*, and add a
  row here. A value used twice without a token is drift.
- **An icon**: add the name to `IconName` and the path to `PATHS` in `Icon.tsx`, drawn on the 16×16
  box at stroke 1.5, `fill: none`.
- **A chart**: one series → `--viz-primary`. Multiple genuinely-categorical series → route the data
  through `foldModels()` and take `--series-N` from it. Two metrics with different scales → two
  separate `<Chart>`s, never one with two axes.
- **A page**: add it under the `AppLayout` route in `main.tsx`, wrap content in `<Shell>`, open with
  a `.page-head`, then a `.kpi-row` if it has headline numbers, then a `.bento` with **unequal**
  spans. Add a rail entry if it is a top-level destination.

## Divergences From the Stated Direction

1. **The ramp is six reachable slots, not eight.** `palette.ts` sets `MAX_SLOTS = 6`; `--series-7`
   and `--series-8` are declared but unreachable.
2. **`AccountLine.tsx` still uses the `✉` glyph** rather than an authored icon.
3. **`--success` is an alias of `--accent`** and is currently unused, as are `--r-xl` and
   `--radius` (a legacy alias). Declared for completeness rather than in service of a rule.
4. **Project and User totals reflect only the sessions loaded so far** once "Load more" is in play —
   surfaced as a data caveat in the KPI `foot` ("loaded so far"), not a visual divergence.
