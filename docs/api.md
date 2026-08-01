# API reference

Source of truth: `server/src/index.ts` — read it, don't trust this doc's line numbers (they
drift); symbol/route names below are exact and grep-able. All routes are mounted directly on
an `express()` app with `cors()` open and a `25mb` JSON body limit. In production the same
process also serves the built `web/dist` SPA (static + catch-all fallback to `index.html`
for non-`/api` `GET`s) — so the web app always calls relative `/api/*` paths, no base URL
config needed.

## Auth

Exactly one route checks a token: **`POST /api/sessions`**, and only if the server was
started with `CLAUDELENS_TOKEN` set (`INGEST_TOKEN` in `index.ts`) — if unset, ingest is
open. When set, requires header `authorization: Bearer <token>`, else `401`.

**Every other route, including both `DELETE` routes, is unauthenticated.** This is
documented and intentionally not fixed here (README rule #8) — do not "fix" it as a
drive-by.

## `GET /api/health`
`{ ok: true }`. No params, no auth.

## `POST /api/sessions`
Ingest endpoint the CLI's `Stop` hook and backfill both call.

- Auth: `Bearer <CLAUDELENS_TOKEN>` if the env var is set.
- Body: `IngestPayload` (`shared/src/types.ts`) — `{ session: ParsedSession, author: string,
  authorEmail?, note?, tags?, account?: AccountIdentity }`. `400` if `session.sessionId` or
  `author` missing.
- **Tombstone gate** runs before the upsert (see `data-model.md`): if a matching row exists
  in `deletions`, responds `200 { ignored: true, untrack: { sessionId } | { cwd } }` —
  deliberately not a 4xx, since the Stop hook is fire-and-forget and would just swallow an
  error status.
- Otherwise: `INSERT ... ON CONFLICT (session_id, author) DO UPDATE` (upsert). Conflict
  behavior worth knowing: `note` only overwrites if the new value is non-null
  (`COALESCE(EXCLUDED.note, sessions.note)`); `tags` only overwrites if the new array is
  non-empty; `account_email`/`account_display_name`/`org_name` each `COALESCE` onto the
  existing value (a later sync without account info never blanks a known one);
  `used_auto_mode` is **OR-ed** (a "did this session ever hit auto mode" fact, sticky true);
  `parser_version` takes `GREATEST` (never regresses).
- Success: `{ id, url: "/session/<id>" }`. Failure: `500 { error: 'ingest failed' }`.

## `GET /api/sessions`
List/filter, no transcript body. Response is a **bare array** of session-summary objects
(deliberately not a `{data, page}` envelope — the only client is in-repo).

Query params (all optional except none are required):

| Param | Effect |
|---|---|
| `author` | exact match on `author` column |
| `project` | exact match on `project` column |
| `tag` | `tag = ANY(tags)` |
| `featured=true` | `featured = true` |
| `identity` | `account_email = ? OR (account_email IS NULL AND author = ?)` — the coalesced grouping key, prefer over `author` |
| `autoMode=true` | `used_auto_mode = true` |
| `from` | `started_at >= from` |
| `to` | `started_at < to` |
| `q` | `ILIKE` over `title`, `note`, `author` |
| `includeHidden=true` | otherwise `hidden = false` is always applied |
| `sort` | `cost` → `estimatedCostUsd` desc; `turns` → Claude-side `stats.turns` desc; `messages` → coalesced human message count desc (see below); anything else (default) → `featured DESC, created_at DESC` |
| `limit` | default 100, clamped to `[1, 500]` |
| `offset` | default 0, clamped to `>= 0` |

`messages`-sort and every aggregate that sums human messages uses the same coalescing
expression (`USER_MESSAGES_EXPR` in `index.ts`):
`coalesce((stats->>'userMessages')::int, (stats->>'userTurns')::int, 0)` — see
`data-model.md` for why the fallback to `userTurns` exists.

Response rows come from `summaryRow()`: `{ id, sessionId, title, author, project?,
gitBranch?, note?, tags, featured, hidden, stats, startedAt?, endedAt?, createdAt,
accountEmail?, displayName?, orgName?, usedAutoMode?, permissionModes?, parserVersion? }`.
`stats` is defaulted so old rows never expose `undefined.daily` etc. to the client:
`permissionModes ?? []`, `usedAutoMode ?? false`, `modelUsage ?? {}`, `daily ?? {}`,
`userMessages ?? userTurns ?? 0`.

## `GET /api/analytics?identity=&from=&to=`
One endpoint, three SQL queries run concurrently via `Promise.all` (rejected alternative:
four separate endpoints — one filter state drives all panels, and four endpoints means four
copies of the `WHERE` clause with four chances to disagree). `identity` omitted = org-wide.

`from`/`to` bound `started_at` the same as in `/api/sessions`. Every internal query
references `$1` (the identity param) even when it's `null`, cast explicitly
(`$1::text IS NULL OR ...`) — a bound parameter that the query text never mentions makes
Postgres unable to infer its type and 500s the whole endpoint (this exact bug was hit and
fixed once; see `docs/gotchas.md`).

Response shape:
```
{
  tz: 'UTC',
  totals: { sessions, turns, userMessages, tokens, cost },
  daily:  [{ day, sessions, turns, userMessages, tokens, cost }, ...],   // ORDER BY day
  models: [{ model, sessions, turns, activeMs, tokens, cost, measured }, ...] // ORDER BY activeMs DESC
}
```
- `day` is the raw `'YYYY-MM-DD'` text key from `stats->'daily'` — **never cast with
  `::date`** in this query; casting through node-postgres serializes via the server
  process's local timezone and silently shifts the date (this exact bug was hit once; see
  `docs/gotchas.md`).
- `daily[].sessions` counts a session on **every day it was active**, not exclusively — a
  session spanning Mon–Wed counts three times across those three day-rows. Correct for an
  "activity" chart, but it will not sum to `totals.sessions`. Same caveat applies to
  `models[].sessions` (a session using two models counts once per model).
- `models[].measured` is `bool_and(...)` across every session contributing to that model —
  `true` only if every contributing session had real `turn_duration` data.

## `GET /api/stats`
Aggregate stats for the org-wide leaderboard/value panel. No params, no filters (there is
deliberately no `GET /api/users` or per-user variant of this route — see
`docs/workflows.md` for the full "explicitly out of scope" list).

Response:
```
{
  totals: { sessions, authors, cost },
  authors: [{
    identity,        // coalesce(account_email, author) — stable grouping key
    author,          // most-recently-updated raw author string
    label,           // most recent account_display_name, else author
    orgName,
    sessions, projects, featured,
    autoSessions,    // count WHERE used_auto_mode
    cost,
    turns,           // sum of Claude-side stats.turns
    userMessages,    // sum via USER_MESSAGES_EXPR (coalesced, legacy-safe)
    tokens,
  }, ...],           // GROUP BY identity, ORDER BY sessions DESC
  skills: [{ skill, uses }],   // top 25, from stats.skills[] via jsonb_array_elements_text
  tools:  [{ tool, uses }],    // top 25, from stats.toolUsage via jsonb_each_text
}
```
All queries filter `hidden = false`.

## `GET /api/sessions/:id`
Full session including transcript. `404` if not found. Response is `summaryRow(r)` plus
`authorEmail` (raw column, separate from the `account`-derived `accountEmail`) and
`turns: r.transcript` (the full `Turn[]`, not present on the list endpoint).

## `PATCH /api/sessions/:id`
Curation only: `{ featured?: boolean, hidden?: boolean, tags?: string[] }` in the body — at
least one must be present or `400`. Builds a dynamic `SET` clause from whichever fields were
given. `404` if the id doesn't exist. Returns `summaryRow()` of the updated row.

## `DELETE /api/sessions/:id`
**Unauthenticated.** Transactional: `BEGIN` → look up `(session_id, author)` for that row
(`404` + rollback if missing) → insert a `('session', author, session_id)` tombstone into
`deletions` (`ON CONFLICT DO NOTHING`) → `DELETE FROM sessions` → `COMMIT`. Response
`{ deleted: rowCount }`. The tombstone is what stops the next `Stop` hook from resurrecting
this exact session (see `data-model.md`).

## `DELETE /api/projects?author=&project=`
**Unauthenticated.** Deletes every session for one `(author, project)` pair — the
dashboard's notion of "a project". Both query params required or `400`. The literal string
`'(no project)'` for `project` is a route-boundary sentinel translated to `project IS NULL`
+ a `no_project = true` tombstone column — that sentinel string itself must never be written
into the `deletions` table. Same transactional tombstone-then-delete pattern as the session
route. Response `{ deleted: rowCount ?? 0 }`.

## camelCase-alias rule for SQL

Postgres lowercases any **unquoted** identifier. Every computed column alias that needs to
reach the JS/JSON layer as camelCase **must be double-quoted** in the SQL, e.g.
`AS "userMessages"`, `AS "activeMs"`, `AS "orgName"`, `AS "autoSessions"`. An unquoted alias
like `AS active_ms` silently becomes lowercase `active_ms` in the result set and will not
match a camelCase field the frontend expects — this exact bug was hit once (see
`docs/gotchas.md`). When adding a new computed/aggregate column to any query in
`server/src/index.ts`, quote the alias if it contains a capital letter.
