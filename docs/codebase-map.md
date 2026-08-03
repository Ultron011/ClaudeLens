# Codebase map — fast orientation

Read this to get productive in under 5 minutes. It covers structure, key files, the core
data types, and how data flows from a Claude session to the UI. See the other docs for depth.

## Monorepo layout

```
ClaudeLens/
├── shared/src/          @claudelens/shared — types, parser, pricing, redact
│   ├── types.ts         ALL shared TypeScript types (start here for data shapes)
│   ├── parser.ts        parseTranscript(): JSONL → ParsedSession + SessionStats
│   ├── pricing.ts       costForUsage(): token counts → USD, keyed by model substring
│   └── redact.ts        optional PII scrubbing
├── server/src/
│   ├── index.ts         Express app: ALL routes in one file. Read top-to-bottom.
│   └── db.ts            SCHEMA + MIGRATIONS DDL. One table: sessions. One: deletions.
├── web/src/
│   ├── main.tsx         React Router routes — add new pages here + in AppLayout nav
│   ├── api.ts           Fetch wrappers + web-only TypeScript types
│   ├── format.ts        fmtCost, fmtTokens, fmtDuration, fmtDay helpers
│   ├── useFetch.ts      Generic fetch hook with abort + no-flash refetch
│   ├── usePref.ts       URL+localStorage preference (range, layout, etc.)
│   ├── pages/           One file per route
│   ├── components/      Shell, Kpi, ViewToggle, Icon, AppLayout (nav + StatsCtx)
│   └── charts/          Chart.tsx (line/bars), Donut.tsx, palette.ts (foldModels)
├── cli/src/             sync.ts + history.ts — upload sessions to server
└── plugin/              Claude Code hooks + skills (bundled with esbuild)
```

## Key data types (shared/src/types.ts)

**`SessionStats`** — the `stats` jsonb blob stored per session:
- `inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens` — total token breakdown
- `modelUsage: Record<string, ModelUsage>` — per-model rollup (turns, tokens, cost, activeMs)
- `daily: Record<string, DailyStats>` — per-UTC-day rollup (YYYY-MM-DD keys)
- `toolUsage: Record<string, number>` — tool name → count, session level
- `permissionModes`, `usedAutoMode`, `skills`, `subagents`, `durationMs`

**`ModelUsage`** — per model in one session:
- `turns, totalTokens, costUsd, activeMs, measured`
- `inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens` (added in parser v5)
- `measured: false` means activeMs came from fallback gap estimation, not `turn_duration` lines

**`PARSER_VERSION`** (`shared/src/parser.ts`) — bump whenever `SessionStats` or `ModelUsage`
shape changes. Old sessions with a lower version auto-re-sync via the CLI's backfill path.

## DB schema (server/src/db.ts)

One primary table: `sessions`. Columns of note:
- `stats jsonb` — stores the full `SessionStats` blob
- `transcript jsonb` — stores the `Turn[]` array
- `started_at / ended_at timestamptz` — for duration queries
- `account_email, account_display_name` — linked Claude account
- `permission_modes text[]` — all modes observed in the session
- `parser_version int` — backfill ledger key

Identity scoping: `IDENTITY_CLAUSE` in `server/src/index.ts` matches by `account_email` OR
`author`, so email and display-name both work as filter keys.

## API endpoints (server/src/index.ts)

| Route | Purpose |
|---|---|
| `GET /api/analytics` | Totals + daily + per-model rollup for a scope/date range |
| `GET /api/model-analytics` | Extended model breakdown: token types, tools, team matrix |
| `GET /api/stats` | Org-wide totals + author leaderboard + top skills/tools |
| `GET /api/sessions` | Filtered session list (no transcript) |
| `GET /api/sessions/:id` | Full session with transcript |
| `POST /api/sessions` | Ingest (CLI upload, token-gated) |

All three analytics endpoints accept `identity` (person scoping), `from`, `to` (ISO date
strings). `$1::text IS NULL OR ${IDENTITY_CLAUSE(1)}` is the pattern for optional filtering.

## Web routes (web/src/main.tsx)

| Path | Page |
|---|---|
| `/` | OverviewPage — team dashboard, KPIs, leaderboard |
| `/analytics` | AnalyticsPage — tokens/sessions/cost over time + model table |
| `/analytics/u/:author` | AnalyticsPage scoped to one person |
| `/analytics/models` | ModelAnalyticsPage — model comparison, token breakdown, team matrix |
| `/analytics/models/u/:author` | ModelAnalyticsPage scoped to one person |
| `/u/:author` | UserPage — person's projects |
| `/u/:author/:project` | ProjectPage — project's sessions |
| `/session/:id` | SessionPage — full transcript viewer |

## Frontend patterns

- **`useFetch<T>(fn, deps)`** — pass a `(signal) => Promise<T>`, provide deps array.
  Cancels in-flight on dep change. Returns `{ data, err, loading }`. Previous data persists
  during refetch (no loading flash on range change).
- **`usePref(key, fallback)`** — URL param → localStorage → fallback. Sets both on change.
  Used for `range`, `layout`, `scope`.
- **Chart component** — `kind: 'line' | 'bars'`, time-series (labels = date strings).
  NOT suitable for category-axis (model names) charts — use CSS bars or inline SVG there.
- **`foldModels()`** — groups models into ≤6 canonical slots (opus→sonnet→haiku order),
  collapses overflow + `<synthetic>` into an "Other" row with `OTHER_COLOR`.
- **Bigint coercion** — Postgres returns `bigint` and `numeric` as strings via node-postgres.
  Always coerce: `Number(m.tokens)`, not `m.tokens + 0`. See `gotchas.md` entry.

## Common patterns when adding a new analytics feature

1. Extend `ModelUsage` or `SessionStats` in `shared/src/types.ts`
2. Accumulate the new field in `shared/src/parser.ts`, bump `PARSER_VERSION`
3. Add/extend a server endpoint in `server/src/index.ts` using jsonb lateral expansion
4. Add the response type in `web/src/api.ts`, add a fetch function
5. Add the route in `web/src/main.tsx`
6. Add a nav item in `web/src/components/AppLayout.tsx`
7. Write the page in `web/src/pages/`

The `scopeWhere` / `IDENTITY_CLAUSE` pattern in `server/src/index.ts` is the standard
for optional `identity`+`from`+`to` filtering — copy it exactly.
