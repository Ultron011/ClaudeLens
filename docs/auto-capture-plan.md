# ClaudeLens auto-capture plugin — implementation plan

Goal: replace the manual, one-shot CLI publisher with **automatic per-turn sync**
delivered as a Claude Code plugin. No confirmation step, no redaction gate.
Sessions are captured continuously as they grow (and across resumes), scoped to
projects the developer has explicitly opted in. Contributors are identified by a
name set once at setup (works around the shared team email).

## Design decisions (locked)

- **Trigger:** `Stop` hook — fires once per assistant turn, receives
  `session_id`, `transcript_path`, `cwd`, runs with no confirmation, cannot block.
- **Idempotency:** server already upserts. Resume keeps the same `session_id` and
  appends, so re-pushing the whole transcript each turn just refreshes one row.
  Start with full-resend (simple + correct); incremental byte-offset sync is a
  later optimization.
- **Identity:** a `contributor_id` (random, stable) + display `name`, set once via
  `/claudelens:setup`, stored in `~/.claude/claudelens.json`. Upsert key changes
  from `(session_id, author)` → `(session_id, contributor_id)`. `author` stays as
  the display name.
- **Project opt-in (default OFF):** a project syncs only if either
  (a) a committed `.claudelens.json` marker exists at/above `cwd`, or
  (b) `cwd` is in the user allowlist in `~/.claude/claudelens.json`.
- **Redaction:** keep `redactDeep` wired into the sync path but **non-blocking**
  and toggleable (`redact: false` default). One flag flips it back on later.

## Changes

### 1. shared (`shared/src/types.ts`)
- Add `contributorId?: string` to `IngestPayload`.

### 2. server (`server/src/db.ts`, `server/src/index.ts`)
- Schema: add `contributor_id text`; change `UNIQUE (session_id, author)` →
  `UNIQUE (session_id, contributor_id)`. (Dev DB: `pnpm db:reset` to reapply.)
- Ingest: accept `contributorId`, insert it, upsert `ON CONFLICT
  (session_id, contributor_id)`. Fallback to `author` if `contributorId` missing
  (keeps old CLI working).

### 3. cli → sync + setup + config
- `cli/src/config.ts` — read/write `~/.claude/claudelens.json`
  (`{ name, contributorId, server, token?, projects: string[], redact: false }`);
  `isProjectOptedIn(cwd)` resolving marker file (walk up) + allowlist.
- `cli/src/sync.ts` — reads hook JSON from **stdin**, resolves opt-in (exit 0
  silently if not), loads config, `parseTranscript(transcript_path)`, optional
  redaction, POSTs `{ session, author: name, contributorId, ... }`. Best-effort:
  never throws in a way that would surface to the session.
- `cli/src/setup.ts` — interactive: prompts name (generates `contributorId` if
  absent), server URL; offers to opt the current project in (writes
  `.claudelens.json` marker and/or adds to allowlist).
- Keep existing `index.ts` manual publisher working (now sends `contributorId`).

### 4. plugin package (`plugin/`)
- `plugin/.claude-plugin/plugin.json` — name `claudelens`, version.
- `plugin/hooks/hooks.json` — `Stop` → `command` running the sync script.
- `plugin/skills/setup/SKILL.md` → `/claudelens:setup`.
- `plugin/skills/publish/SKILL.md` → `/claudelens:publish` (manual one-off).
- A local marketplace file so it can be `/plugin install`ed for the test.

## End-to-end test (definition of done)

1. `pnpm db:reset && pnpm db:migrate && pnpm dev` (server :4000, web :5173).
2. Install/enable the plugin locally; run `/claudelens:setup` — set a name, opt
   in the ClaudeLens repo itself.
3. Start a Claude session **in this repo**, do 2–3 turns.
4. Verify: a row appears at http://localhost:5173 with the right name; turn count
   grows after each turn; resuming the session updates the same row (not a dup).
5. Start a session in a **non-opted-in** dir → confirm nothing is sent.
