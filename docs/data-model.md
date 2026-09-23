# Data model

Shapes: `shared/src/types.ts`. DB: `server/src/db.ts` (`SCHEMA` + `MIGRATIONS`). This doc is
the shape reference plus the invariants and legacy contract an agent must not violate.

## `shared/src/types.ts` — the shapes

- `RawEntry` — one JSONL line, loosely typed (the format drifts). See
  `docs/claude-code-jsonl.md` for the full observed key set and per-key provenance.
- `Turn` — one normalized transcript entry: `role`, `text`, `thinking`, `toolCalls`,
  `permissionMode` (carried forward from the last-seen mode, see below).
- `ToolCall` — `{ name, detail?, args?, questions?, declined?, error?, denied? }`. `error`
  (v7) = the tool_result came back `is_error` and was not a denial; `denied` (v7) = the line's
  `toolDenialKind` (`user-rejected`, `automode-blocked`, `permission-rule`, …) — a denial sets
  `denied` only, never `error`.
  - `detail` — **frozen meaning**: for `Skill` calls, the skill id; for `Task`/`Agent`
    calls, `subagent_type` (or `description`). Nothing else ever sets it. `stats.skills`,
    `stats.subagents`, and the live `/api/stats` `skills`/`tools` SQL all key off this exact
    field — do not repurpose it for a new tool type or change what populates it without
    checking those three consumers.
  - `args` — purely additive, added alongside `detail` without changing it
    (`shared/src/parser.ts`: `toolCalls.push({ name, detail, args: summarizeToolArgs(...) })`).
    ≤4000 chars with the input's own line breaks kept (v8; was one-line ≤300 before), redacted
    *before* truncation, **always** (unconditionally, not gated on the user's `cfg.redact`
    setting — command lines are the highest-density secret location). Known tools emit their
    1–2 fields on one line; unknown/MCP tools emit every scalar non-NEVER field as `key=value`,
    one per line. The dashboard shows the first line and expands to the rest.
    `NEVER` regex in `parser.ts` permanently excludes file-body-shaped fields
    (`content`, `new_string`, `old_string`, `patch`, `diff`, `prompt`, `text`, `todos`, ...)
    from ever appearing in `args`, even under the generic fallback rule.
- `SessionStats` — the per-session rollup. Notable fields:
  - `turns` — every `user`/`assistant` JSONL line with non-empty content, **including**
    tool_result carrier lines with tool calls. This is Claude-side message volume, not human
    message count — historically shown to users as "turns" and reads ~11× too large versus
    actual human input (`docs/claude-code-jsonl.md` has the measured ratio).
  - `userMessages` — genuine human-typed message count (see legacy contract below for the
    pre-v3 name). This is the metric surfaced to users as "messages" today
    (`web/src/format.ts: msgCount`).
  - `assistantTurns` — Claude-side turns; kept for sorting/ratio, not a headline metric.
  - `permissionModes: PermissionMode[]` — every mode observed, first-seen order.
    `usedAutoMode: boolean` — `permissionModes.includes('auto')`. `PermissionMode` is
    deliberately open (`| (string & {})`) — the binary's enum drifts between releases and
    `'auto'` has **never** been observed on real disk data (0 of ~1,465 sampled values,
    `acceptEdits` 723 / `default` 697 / `plan` 45). Detection is correct but unexercised;
    never write an exhaustive `switch` over this type.
  - `modelUsage: Record<model, ModelUsage>` — per-model `{turns, totalTokens, costUsd,
    activeMs, measured}`. `measured: false` means `activeMs` came from the capped-gap
    fallback (see below), never mixed with real `turn_duration` data within one session.
  - `daily: Record<'YYYY-MM-DD', DailyStats>` — **UTC calendar day**, computed once at parse
    time from `e.timestamp.slice(0, 10)` (valid because Claude Code timestamps are always
    `Z`-suffixed). `DailyStats.userMessages` exists; `ModelUsage` deliberately has **no**
    `userMessages` field — a human message isn't attributable to a model, and there is no
    correct way to attribute it.
  - `activeMsMeasured` — session-wide version of `ModelUsage.measured`.
  - **v7 additions (all optional — absent on older rows):** `toolErrors` (tool → failed calls),
    `toolDenials` (denial kind → count), `subagentUsage` (agentType → `{runs, totalTokens,
    costUsd, toolCalls}`), `interrupts`, `compactions`, `apiErrors`, `rateLimitHits`,
    `reported` (`{costUsd, linesAdded, linesRemoved}` from Claude Code's `cost-state` lines:
    last line per run/`startTime`, summed across runs; absent when the file has none).
  - **Token/cost accounting (v7):** Claude Code writes one assistant line per content block, all
    sharing `message.id` with identical `usage`. Usage is counted once per `message.id`
    (fallback `requestId`), and the split lines merge into ONE `Turn` — so `turns`,
    `assistantTurns`, `modelUsage.turns` and `daily.turns` count API messages, not blocks.
    Before v7 tokens were ~2× and cost ~2–5× inflated (see `claude-code-jsonl.md`).
  - **Subagents (v7):** `<session>/subagents/agent-*.jsonl` usage folds into the token totals,
    `estimatedCostUsd`, `modelUsage` tokens/cost, `daily` tokens/cost and `toolUsage` — but NOT
    into `turns`/`assistantTurns`/`modelUsage.turns`/`daily.turns` (so
    `sum(modelUsage.turns) === assistantTurns` still holds; a subagent-only model can have
    `turns: 0`). Subagent turns are never added to `Turn[]`.
  - **Excluded from messages/turns (v7):** compaction summaries (`isCompactSummary` /
    `isVisibleInTranscriptOnly` user lines — dropped entirely), `[Request interrupted by user…]`
    lines (→ `interrupts`), `<synthetic>`/`isApiErrorMessage` assistant lines (→ `apiErrors`,
    `rateLimitHits`; not in `models`/`modelUsage`). A `queued_command` attachment (prompt typed
    mid-turn, `origin.kind: human`) becomes a user turn only if the same text never reappears as a
    later `user` line.
  - **Pricing (`shared/src/pricing.ts`):** calibrated against `cost-state`. Cache writes are
    split by TTL: `cache_creation.ephemeral_5m_input_tokens` at 1.25× input,
    `ephemeral_1h_input_tokens` at 2× (no breakdown → all 5m); web search $10/1000.
- `ParsedSession.parserVersion: number` — see versioning contract below.
- `AccountIdentity` — `{email?, displayName?, organizationName?}`. Read from
  `~/.claude.json → oauthAccount` at sync time (see `architecture.md` for the "not
  currently wired" caveat — this type and its plumbing exist, but nothing populates it yet).

## DB schema — frozen `SCHEMA` + additive `MIGRATIONS`

`server/src/db.ts` exports two template-literal SQL blocks, both run on every boot
(`index.ts: start()`) and by `migrate.ts`, in order: `SCHEMA` then `MIGRATIONS`.

- **`SCHEMA` is the frozen v1 baseline.** It will never gain a column again.
- **Every new column lives only in `MIGRATIONS`**, as `ALTER TABLE sessions ADD COLUMN IF
  NOT EXISTS ... `. In Postgres 16, adding a column with a non-volatile default is
  metadata-only (no table rewrite, no long lock) — that's what makes "just re-run this on
  boot" safe.
- **Why not a migration framework**: the deployment story is "boot the server and the
  schema appears" — a framework adds a dependency and a deploy step for no benefit here.
- **Why not write new columns in both blocks**: that's the drift trap — a fresh DB (runs
  `SCHEMA` then `MIGRATIONS`) and an upgraded DB (already has `SCHEMA`, only gains
  `MIGRATIONS`) must execute the identical set of statements to end up in the identical
  state. Duplicating a column definition risks the two paths diverging.

Current `MIGRATIONS` contents (`server/src/db.ts`): `account_email`, `account_display_name`,
`org_name` (text, nullable), `used_auto_mode` (boolean, default false), `permission_modes`
(text[], default `{}`), `parser_version` (int, default 0), three indexes, and the
`deletions` tombstone table.

### `deletions` — why tombstones, not a client-side skip

A session/project delete writes a row here in the **same transaction** as the `DELETE FROM
sessions`. Rejected alternative: telling the CLI to self-ignore the deleted id/project.
That can't work as the sole mechanism — the server has no way to write to a developer's
local config file, and the next `Stop` hook would just re-upload (resurrect) the row it
knows nothing was deleted. The tombstone is checked on every ingest
(`server/src/index.ts POST /api/sessions`, before the upsert); a hit returns `200
{ignored:true, untrack:{sessionId|cwd}}` (not a 4xx — the hook is fire-and-forget and would
just swallow an error status) which the CLI (`sync.ts`) uses to append to its own local
`ignoreSessions`/`ignoreProjects` as a client-side optimization on top of the tombstone, not
a replacement for it.

`UNIQUE NULLS NOT DISTINCT (scope, author, session_id, project, no_project)` — the
`no_project` boolean plus this constraint is what lets `project = NULL` mean two different
things (session-scope tombstones don't set `project`; project-scope "no project" tombstones
do) without colliding. The `'(no project)'` sentinel string used at the HTTP layer is
translated to `project = NULL, no_project = true` at the route boundary and must never leak
into the table as a literal string.

**Known ceiling, not fixed**: a tombstone can strand a legitimate re-sync. Delete a project
to tidy up, later decide you want it tracked again — every future upload is silently
dropped by the tombstone check, forever, with no UI to lift one. The manual escape hatch is
`DELETE FROM deletions WHERE ...` directly in Postgres.

## Invariants worth asserting (if you touch the parser or the analytics SQL, re-check these)

- `sum(daily[*].totalTokens) === stats.totalTokens`
- `sum(daily[*].userMessages) === stats.userMessages`
- `sum(modelUsage[*].costUsd) ≈ stats.estimatedCostUsd` (within 0.001 — `estimatedCostUsd` is
  a blended scalar computed independently, not derived by summing `modelUsage`)
- `ToolCall.args` never contains a value from a `NEVER`-listed field, is ≤4000 chars, and is
  always redacted (unconditional, unlike turn text redaction which is gated on `cfg.redact`)
- `stats.turns > stats.userMessages` on any real multi-tool-call session
- `ToolCall.detail` semantics are frozen (see above) — `args` is the only extension point

## Active-time (`activeMs`) — attributed, not measured

Two mutually-exclusive methods per session, never mixed (that's what `measured`/
`activeMsMeasured` communicates to callers):

1. **Preferred**: `system`/`turn_duration` JSONL lines (`durationMs`), credited whole to the
   most recent assistant turn's model. Version-dependent — absent on older Claude Code
   transcripts, in which case the parser falls back to method 2 for the *entire* session
   (never partially).
2. **Fallback**: capped inter-turn gap, `min(max(ts - prevTs, 0), 5 * 60_000)` between
   consecutive assistant turns. This measures latency, not work — systematically smaller
   than method 1, and callers must never chart `measured` and non-`measured` sessions in one
   series without surfacing the flag.

Known misattribution, documented not fixed: `turn_duration` covers generation *plus* tool
execution, so a turn with a long `Bash`/`Task` call is over-credited to that turn's model;
and sidechains run concurrently, so summed `activeMs` across models/days can exceed wall
clock — `durationMs` (session-level) stays the honest upper bound.

## Versioning / legacy contract

`PARSER_VERSION` (`shared/src/parser.ts`, currently **8** — v8: full multi-line tool args) is stamped on every
`ParsedSession.parserVersion` and stored per-row as `sessions.parser_version` (upsert takes
`GREATEST(EXCLUDED.parser_version, sessions.parser_version)`, so a stale re-POST never
regresses the stored version). It exists so a future shape-changing parser bump can make old
rows eligible for re-upload: the CLI's ledger (`cfg.backfilled` session → version,
`cfg.backfilledMtime` session → transcript mtime) is written by both live sync and backfill,
and the `SessionStart` catch-up re-uploads ledgered sessions whose version is behind — see
`docs/architecture.md`'s backfill section.

**Old rows can never be upgraded server-side.** The stored `transcript` column is `Turn[]`,
which — for rows written before this feature — never carried per-turn `usage`, so
per-model/per-day stats cannot be recomputed by a server-side migration script from Postgres
alone. Re-running the client-side parser against the original JSONL (a fresh CLI sync or
`sync-history`) is the only path. Until every developer backfills, org-wide analytics
under-report older activity.

**Legacy fallbacks currently in place — do not remove without a data migration, each
removal silently zeroes out old rows' numbers:**

- `stats.userMessages ?? stats.userTurns ?? 0` — parser versions 0–2 wrote the same concept
  under the field name `userTurns`; `web/src/format.ts: msgCount` and
  `server/src/index.ts: summaryRow()` both apply this fallback independently (client and
  server each read raw stored JSON, so both need it).
- SQL equivalent, used everywhere the metric is aggregated server-side (`USER_MESSAGES_EXPR`
  in `server/src/index.ts`): `coalesce((stats->>'userMessages')::int,
  (stats->>'userTurns')::int, 0)`.
- Old `daily` buckets (written before `userMessages` existed on `DailyStats`) have no
  `userMessages` key at all inside that day's object — `0` is the correct read for those
  days; only a full re-sync of that session backfills real numbers, there is no per-day
  fallback field to coalesce against.

## Identity — root cause and the accepted-scope-cut

Grouping key is `coalesce(account_email, author)` (label: most recent
`account_display_name`, else `author`). Root cause of one human splitting into several
authors: `resolveName()` runs `git config user.name` **in the hook's cwd**, so the same
person gets a different `author` string per repo depending on that repo's local git config.
The intended fix is preferring `account.displayName` ahead of the git lookup (see
`architecture.md` — not yet wired). Pre-existing duplicate rows from before any fix remain
duplicated; collapsing them would require changing the `UNIQUE (session_id, author)`
constraint plus a merge migration, which is deliberately out of scope.

## Rejected alternatives worth knowing (so they aren't re-proposed)

| Rejected | Why |
|---|---|
| `GROUP BY started_at::date` for day buckets | Sessions span midnight and resumes span days; the whole session's tokens land on day 1 in SQL, and wrongness grows with session length — exactly the sessions that matter most. |
| A derived `session_days` table | Fastest option, only one that indexes by day — but doubles the DDL surface and puts transactional child-row writes inside a hook that fires every assistant turn. Documented escape hatch if `/api/analytics` ever exceeds ~300 ms. |
| Viewer-local day buckets | Pre-bucketing at parse time locks in a timezone; local buckets from teammates in different zones can't be summed later. Cost accepted: late-night work in a positive-UTC-offset zone lands on the next UTC day. Escape hatch is `stats.hourly` (not built) — never un-bucket `daily` itself. |
| A migration framework | See "why not" above. |
| Writing new columns in both `SCHEMA` and `MIGRATIONS` | The drift trap — see above. |
| Telling the CLI to self-ignore a deleted id (no server tombstone) | Server can't write client config; next `Stop` hook resurrects the row regardless. |
