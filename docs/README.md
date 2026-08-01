# ClaudeLens — agent entry point

Read this first. It routes you to the other docs and states what you must never break.
Keep this file itself under ~120 lines — it's read on every task.

## What this is

A self-hosted gallery of a team's Claude Code sessions. A CLI, installed as a Claude Code
plugin, tails the local JSONL transcript on every `Stop` hook and POSTs a parsed, redacted
summary to a small Express + Postgres server; a React SPA renders it. Purpose is **learning
and curation** (which prompts/skills/subagents work), not itself a cost dashboard — cost/
usage numbers are a side effect, pulled straight from the transcript, not billing-accurate.

## Package map

| Package | Owns | Entry file |
|---|---|---|
| `shared/` | JSONL→`ParsedSession` parser, all shared TS types, redaction, pricing table | `shared/src/parser.ts`, `shared/src/types.ts` |
| `server/` | Express API, Postgres schema/migrations, all SQL aggregation | `server/src/index.ts`, `server/src/db.ts` |
| `cli/` | The plugin's Node bundle: `Stop`-hook sync, slash-command ops, account reading | `cli/src/cli.ts` (arg-switch dispatcher) |
| `web/` | React SPA (4 runtime deps: react, react-dom, react-router-dom, `@claudelens/shared`) | `web/src/main.tsx` |
| `plugin/` | The installable Claude Code plugin: hook wiring, skill (slash-command) markdown, the **built** CLI bundle | `plugin/hooks/hooks.json`, `plugin/dist/claudelens.mjs` |

`cli/` and `server/` both depend on `shared/` via `workspace:*` — change shared types first,
then `pnpm typecheck` from repo root to see what breaks downstream.

## Which doc do I read for which task

| Task | Doc |
|---|---|
| Trace a request end-to-end, understand the sync trigger, plugin install/update chain | `docs/architecture.md` |
| Add/change a field on `ParsedSession`/`SessionStats`, touch the DB schema, understand legacy fallbacks | `docs/data-model.md` |
| Add/change an HTTP endpoint, its params or response shape | `docs/api.md` |
| Understand a Claude Code JSONL transcript's actual on-disk shape | `docs/claude-code-jsonl.md` |
| You hit a weird CSS/SQL/test bug that "should" work | `docs/gotchas.md` |
| Touch a React page/component, styling conventions | `docs/frontend.md` |
| Backfill, opt-out switches, delete semantics, day-to-day dev commands | `docs/workflows.md` |
| **Historical, superseded** — do not follow as current design | `docs/auto-capture-plan.md` (early design note; `architecture.md` is authoritative now) |

## Non-negotiable rules

1. **`SCHEMA` in `server/src/db.ts` is frozen.** Every new column goes only in `MIGRATIONS`
   (`ADD COLUMN IF NOT EXISTS ...`). Writing a column in both is the drift trap — fresh and
   upgraded DBs must take the identical code path. Run `MIGRATIONS` right after `SCHEMA` in
   both `index.ts` boot and `migrate.ts`.
2. **`ToolCall.detail` is frozen** — `stats.skills`/`stats.subagents` and live `/api/stats` SQL
   depend on its exact current meaning (Skill/Task/Agent identifier only). `ToolCall.args` is
   the additive field for anything new; never repurpose `detail`.
3. **The `Stop` hook must never break a session.** `cli/src/cli.ts`'s top-level catch swallows
   sync errors; `readAccount()` in `account.ts` never throws. Any new code reachable from
   `claudelens sync` inherits this contract — no exceptions escape.
4. **`Stop` re-parses and re-POSTs the whole transcript every assistant turn** — O(n²) bytes
   per session, capped only by the 25 MB Express body limit (`server/src/index.ts`). This is a
   known ceiling, not a bug to silently fix; see `architecture.md`.
5. **Day buckets (`stats.daily`) are UTC, computed once in the parser at parse time.** Never
   `GROUP BY started_at::date` in SQL — sessions span midnight and resumes span days, so a
   multi-day session's tokens would all land on day 1.
6. **`web` has exactly 4 runtime deps.** Don't add a chart lib, a data-fetching lib, or a UI kit
   — see `docs/frontend.md` for the hand-rolled alternatives already in place.
7. **Relative TS imports use `.js` extensions** (NodeNext resolution). Wrong extension = build
   break, not a lint warning.
8. **Destructive API endpoints (`DELETE /api/sessions/:id`, `DELETE /api/projects`) are
   unauthenticated**, same as the ingest-token-gated `POST /api/sessions`'s siblings. This is
   documented, not fixed — don't "fix" it as a drive-by in an unrelated change.

## Before you start

- `pnpm install` at repo root (pnpm workspaces; `cli`/`server` resolve `@claudelens/shared` via
  `workspace:*`).
- Postgres 16 runs in Docker as container `claudelens-pg` on port **5544** (`pnpm db:up`).
  There is no local `psql` binary — query it with
  `docker exec -i claudelens-pg psql -U claudelens -d claudelens -c "..."`.
- `pnpm db:migrate` applies `SCHEMA` + `MIGRATIONS`; safe to re-run (idempotent).
- `pnpm typecheck` (repo-root, runs per-package `tsc --noEmit`) after any change — do this
  before calling anything done, especially after touching `shared/src/types.ts`.
- `cd shared && pnpm test` runs the one parser test file (`node --test`, no test runner dep).
- Changing `cli/src/*` requires `pnpm plugin:build` (esbuild bundle) to reach
  `plugin/dist/claudelens.mjs` — and that file is a **tracked, committed build artifact**; a
  local-only change to `cli/src` never affects a real Claude Code session until it's rebuilt,
  committed, and pushed (see `architecture.md` for the full plugin install/cache chain).
- Kill a dev server by PID from `ss -lptn 'sport = :4000'` (or `:5173`). **Never `pkill -f`** —
  it can match the agent's own shell process and kill the working session.
