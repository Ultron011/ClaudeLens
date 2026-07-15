# ClaudeLens auto-capture — design

Goal: install the plugin, connect once, and **every** Claude Code session syncs
automatically. No terminal CLI, no interactive setup, no per-project opt-in.
Opting out is a slash-command switch that stops data **before** it's sent.

## Design decisions (current)

- **Trigger:** `Stop` hook — fires once per assistant turn, receives
  `session_id`, `transcript_path`, `cwd` on stdin, runs with no confirmation,
  cannot block. Runs `node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" sync`.
- **Idempotency:** the server upserts on `(session_id, author)`. Resume keeps the
  same `session_id`, so re-pushing the whole transcript each turn refreshes one
  row.
- **Enablement:** `/claudelens:connect <server> <token>` stores config in
  `~/.claude/claudelens.json` and **excludes its own session** so the typed token
  is never uploaded. `CLAUDELENS_SERVER` / `CLAUDELENS_TOKEN` env also work for
  centrally-provisioned machines. Nothing syncs until `server` is set.
- **Identity:** `author` = `name` from config → `CLAUDELENS_NAME` → `git config
  user.name` → OS username. No prompt.
- **Tracking is on by default; opt-out is layered** (all checked by `shouldSync`
  before any upload, so opting out at session start sends nothing):
  - `paused` — global kill-switch (`/claudelens:pause`).
  - `ignoreProjects` — per-project, this machine (`/claudelens:untrack-project`).
  - `ignoreSessions` — per-session (`/claudelens:untrack`).
  - a committed `.claudelens` file — excludes a repo for the whole team
    (`/claudelens:untrack-project --team`).
  - `DO_NOT_TRACK` / `CLAUDELENS_DISABLE` env — honored globally.
- **Redaction:** `redactDeep` stays wired into the sync path but non-blocking and
  off by default (`redact: false`).

## Code map

- `cli/src/config.ts` — config + `shouldSync` (the one gate), `resolveName`,
  `.claudelens` marker parsing/walk-up.
- `cli/src/sync.ts` — Stop-hook entry: reads hook JSON from stdin, `shouldSync`,
  `parseTranscript`, optional redaction, POST. Never throws into the session.
- `cli/src/connect.ts` — `/claudelens:connect`.
- `cli/src/optout.ts` — untrack/track session & project, pause/resume.
- `cli/src/status.ts` — `/claudelens:status`. `cli/src/update.ts` — `/claudelens:update`.
- `cli/src/cli.ts` — op dispatch (not a human CLI; invoked by hook + skills).
- `plugin/hooks/hooks.json` — the `Stop` hook. `plugin/skills/*` — the slash commands.
- The whole thing bundles to `plugin/dist/claudelens.mjs` via `pnpm plugin:build`.

## End-to-end test (definition of done)

1. `pnpm db:up && pnpm db:migrate && pnpm dev` (server :4000, web :5173).
2. Not connected → `sync` does nothing.
3. `connect <server> <token> --session <id>` → config written, that session
   excluded (token never uploaded).
4. A normal session syncs; `untrack`/`untrack-project`/`pause`/`DO_NOT_TRACK`/a
   committed `.claudelens` each block the sync **before** the POST.
5. Resuming a synced session updates the same row (no duplicate).
