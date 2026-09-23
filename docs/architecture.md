# Architecture — end-to-end data flow

See `docs/README.md` for the rules this doc assumes. This doc traces one request through
every layer, then covers the two chains that aren't obvious from reading any single file:
the sync-trigger/re-upload cost, and the plugin install/update path.

## The pipeline

```
Claude Code session
  → Stop hook fires (once per assistant turn)
  → node plugin/dist/claudelens.mjs sync   (cli/src/sync.ts: runSync)
      reads hook stdin {session_id, transcript_path, cwd}; cheap gate (connected/paused/env),
        then re-spawns itself detached (`sync --detached`, payload in CLAUDELENS_HOOK_PAYLOAD)
        and exits — the hook returns in ~0.2 s (node startup)
      detached child: loadConfig() (cli/src/config.ts) → shouldSync() gate (see below)
      readSettledSession(): poll the file (≤20×250ms) until its last line is a system
        stop_hook_summary / turn_duration (the turn is fully on disk), then
        parseTranscript(jsonl, { subagents }) — subagents read from <session>/subagents/
      uploadSession() (cli/src/upload.ts): redactDeep() over turns + title + firstUserPrompt
        (cfg.redact, default TRUE), POST with a 15 s AbortSignal.timeout
      POST /api/sessions  { session: ParsedSession, author, account?, ... }
      on success: ledger backfilled[id] = PARSER_VERSION, backfilledMtime[id] = file mtime
      every attempt: lastSyncAt / lastSyncOk / lastSyncError (shown by /claudelens:status)
  → SessionStart hook: `claudelens.mjs catchup` — detached, re-uploads ≤25 stale ledgered
      sessions (see "Backfill path")
  → server/src/index.ts: POST /api/sessions
      tombstone check against `deletions` table (see data-model.md) — if hit, return
        200 {ignored:true, untrack:{...}} (never 4xx; the Stop hook is fire-and-forget)
      INSERT ... ON CONFLICT (session_id, author) DO UPDATE  (upsert)
  → Postgres `sessions` table (jsonb `stats` + `transcript` columns)
  → GET /api/sessions | /api/sessions/:id | /api/stats | /api/analytics
  → web/src/api.ts fetch wrappers → React pages (web/src/pages/*)
```

`parseTranscript` (`shared/src/parser.ts`) is the one place JSONL becomes structured data —
both the live sync path and the backfill path (`cli/src/history.ts`) call it directly, so a
backfilled session is byte-for-byte produced the same way as a live one.

## The `shouldSync` gate (`cli/src/config.ts`)

Checked, in this exact order, before any network call — flipping any one guarantees nothing
for that scope leaves the machine:

1. `isConnected(cfg)` — `cfg.server` unset ⇒ never sync (connecting is the enablement step).
2. `cfg.paused` — global kill-switch (`/claudelens:pause`).
3. `envOptedOut()` — `DO_NOT_TRACK` or `CLAUDELENS_DISABLE` env truthy.
4. `isExcludedLocally(cwd, cfg)` — `cwd` under any path in `cfg.ignoreProjects`
   (`/claudelens:untrack-project`).
5. `cfg.ignoreSessions.includes(sessionId)` — per-session opt-out
   (`/claudelens:untrack`), also how `connect` hides the session where the token was typed.
6. `isRepoExcluded(cwd)` — walks up from `cwd` (bounded 40 levels) looking for a committed
   `.claudelens` marker file; its mere presence defaults to "excluded" even if unparseable.

All local/config-file based — none of this touches the server. Config lives at
`~/.claude/claudelens.json` (survives plugin updates) and is loaded fresh on every hook
invocation; there is no daemon or cache across turns.

## Multiple Claude Code profiles (`CLAUDE_CONFIG_DIR`)

Claude Code keeps each profile's data under `$CLAUDE_CONFIG_DIR` (default `~/.claude`). Hooks and
skill commands inherit Claude Code's env, so the CLI always sees the profile that ran it.
Everything the CLI reads **from Claude Code** follows it (`cli/src/config.ts: claudeConfigDir()`,
`projectsDir()`): transcripts (`history.ts` list/backfill/catch-up, `optout.ts`'s session-id
fallback, `curate.ts`'s transcript lookup), the plugin registry (`update.ts`), and the account
file (`account.ts: accountPath()` — `$CLAUDE_CONFIG_DIR/.claude.json`, but `~/.claude.json`
*beside* the dir by default, matching Claude Code). Each profile's SessionStart catch-up and
`sync-history` only see that profile's `projects/`; the Stop hook gets the transcript path in its
payload so it needs no lookup.

**Decision: ClaudeLens's own config does NOT move.** It stays at `~/.claude/claudelens.json` for
every profile (it was already homedir-based, never per-profile), so one `/claudelens:connect`
covers all profiles, and pause / untrack lists / the ledger are machine-wide. Session ids are UUIDs,
so profiles sharing one ledger can't collide. `updateConfig` `mkdir -p`s `~/.claude` in case only
a custom profile dir exists. Author is the same `resolveName()` for every profile; the account
(email) is per profile, since it's read from that profile's `.claude.json`.

## Status and the last-sync stamp

`/claudelens:status` (`cli/src/status.ts`, skill passes `--root "${CLAUDE_PLUGIN_ROOT}"`, else it
derives the root from the bundle path) prints server, Claude config dir in use (and whether it
came from `CLAUDE_CONFIG_DIR`), plugin version (from `<root>/.claude-plugin/plugin.json`) + root,
the ClaudeLens config path, author, account, parser version, paused state, the **last sync
attempt**, per-dir tracking, exclusions and server health. The last-sync fields
(`lastSyncAt` ISO, `lastSyncOk`, `lastSyncError` ≤300 chars) are written through the merge-safe
`updateConfig` by `config.ts: recordSyncAttempt()` — per upload for the live Stop sync and the
curate commands' sync (`sync.ts: uploadAndRecord`), once per batch for backfill / catch-up
(`history.ts: uploadFiles`; concurrent workers share one tmp-file name, so per-file writes would
race). A tombstoned upload counts as not-ok with a "deleted on the dashboard" error, since that's
a real cause of "sessions stopped arriving". The stamp is best-effort and never throws.

## Curating from Claude Code (`cli/src/curate.ts`)

`/claudelens:note <text>` / `--clear`, `/claudelens:feature` / `--off`, `/claudelens:tag <tag…>` /
`--clear` / (no args = show), `/claudelens:link` → CLI ops `note`, `feature`, `tag`, `link`, each
passed `--session "${CLAUDE_SESSION_ID}"` (resolved exactly like `untrack`:
`optout.ts: resolveSessionId`, falling back to the newest transcript for the cwd) and the author
from `resolveName(cfg, account)` (same as sync). Each is one `POST /api/sessions/curate` with the
ingest bearer token and `{sessionId, author, note?, tags?, featured?}`; no change fields = lookup
(`link`). The note skill passes its text via a quoted heredoc (`--stdin`) so quotes/`$` survive
the shell; the note is `redactText`-ed when `cfg.redact`.

- **404 (not synced yet)** → find `<projects dir>/*/<id>.jsonl`, parse, `shouldSync` gate, upload
  via `uploadAndRecord` (same path/ledger/status stamp as the Stop hook), retry the curate once.
- **Opt-outs**: an untracked session / excluded project / `.claudelens` repo / `DO_NOT_TRACK`
  sends nothing at all and says which switch. **Paused** still curates a session already on the
  server (explicit user metadata) but never uploads a transcript to satisfy a 404.
- Output is one line: `✔ Note saved — <server>/session/<id>`, the bare URL for `link`, or a
  `✖`/explanatory line for network, 401/403 (re-connect), 400 (server's `error`).

## The O(n²) re-upload ceiling — deliberate, not fixed

`Stop` fires once per assistant turn. `runSync` re-parses and re-POSTs the **entire**
transcript file every single time, not a diff. For a session with `n` turns, total bytes
uploaded over its lifetime is `O(n²)` (turn 1 uploads once, turn n uploads the whole
n-turn transcript). The only backstop is Express's `25mb` JSON body limit
(`server/src/index.ts`: `express.json({ limit: '25mb' })`) — a transcript that grows past
that on a single POST fails silently (sync errors are swallowed, contract #3 in the README).

This is a known, accepted ceiling — an incremental/delta upload is the real fix and is
**not implemented**. Revisit if: real transcripts start hitting the 25 MB body limit, or
sync latency/bandwidth on large sessions becomes a complaint. Until then, the upsert-on
`(session_id, author)` conflict target means each POST is idempotent and self-correcting,
which is why this design was accepted rather than built out.

## Account identity — the gap (read this before "fixing" identity bugs)

Per `docs/README.md`, this feature is split:

- **Wired and correct:** `cli/src/account.ts` (`readAccount()`, reads
  `~/.claude.json → oauthAccount`, honors `CLAUDE_CONFIG_DIR`, caches only successful reads
  since Claude Code rewrites the file constantly), `shared/src/types.ts`
  (`AccountIdentity`, `IngestPayload.account`), `server/src/index.ts` (accepts
  `body.account`, writes `account_email`/`account_display_name`/`org_name`, `COALESCE`s on
  conflict so a later sync without an account never blanks a known one).
- **Wired and live:** `cli/src/sync.ts` reads the account via `readAccount()` and attaches it to
  the ingest payload as `account: cfg.shareAccount === false ? undefined : await readAccount()`.
  When a session is synced, `account_email`, `account_display_name`, and `org_name` columns are
  populated (or preserved if a later sync lacks an account). The identity is machine-global — read
  from `~/.claude.json` at sync time, so it reflects the account signed in when the `Stop` hook
  ran, not necessarily the one behind every turn in the session.

If your task touches identity, these are the four places it lives: `cli/src/account.ts`
(reads it), `cli/src/sync.ts` (attaches it to the payload), `cli/src/config.ts`
(`shareAccount?: boolean`, default true — the opt-out; also `resolveName`'s precedence, which
prefers `account.displayName` over `git config user.name` because the latter runs in the
hook's cwd and so splits one person across repos), and `cli/src/status.ts` (prints it).
The server and shared sides need no changes for identity work.

## Plugin install/update chain — non-obvious, has caused real confusion

```
git@github.com:Ultron011/ClaudeLens.git
  → cloned to ~/.claude/plugins/marketplaces/claudelens
  → /claudelens:update pulls that clone, then hot-swaps
      dist/, skills/, hooks/, .claude-plugin/
    into a version-keyed cache directory:
  → ~/.claude/plugins/cache/claudelens/claudelens/<version>/
```

`${CLAUDE_PLUGIN_ROOT}` (used by `plugin/hooks/hooks.json` and every `SKILL.md`'s command
line) resolves to that **cache** directory, not the marketplace clone and *never* the local
working tree. Consequences:

- **Nothing you edit locally in `cli/src/`, `plugin/skills/`, or `plugin/hooks/` reaches a
  real Claude Code session until it is committed and pushed to GitHub**, and someone runs
  `/claudelens:update` (or reinstalls). Editing `plugin/dist/claudelens.mjs` directly and
  testing locally does not simulate this — the cache copy is what actually executes.
- `plugin/dist/claudelens.mjs` is the esbuild-bundled output of `cli/src/cli.ts`
  (`pnpm plugin:build`, esbuild → single ESM file, node20 target) and is a **tracked build
  artifact** — it must be rebuilt and committed alongside any `cli/src` change, or the
  pushed plugin silently keeps running stale code.
- `plugin/.claude-plugin/plugin.json` carries the plugin's own `version` string — bump it
  when cutting a release users will pull via `/claudelens:update`; there is no automatic
  version derivation.

## Backfill path (`cli/src/history.ts`)

Two ops behind `/claudelens:sync-history`: `list-projects` (peeks the first ~80 lines of
each `.jsonl` under `<projects dir>/<dir>` (`$CLAUDE_CONFIG_DIR/projects`, default `~/.claude/projects`) for `cwd`/`sessionId`, no full parse) and
`sync-history` (full parse incl. subagents + the same `uploadSession()` as live sync, per
selected project dir).

**The ledger** (`~/.claude/claudelens.json`): `backfilled` maps session id → the
`PARSER_VERSION` that last uploaded it (`0` = live sync attempted, never landed), and
`backfilledMtime` maps session id → the transcript's mtime at that upload. Live sync writes
both on every successful upload; backfill writes them per project. A session is *current* when
`version >= PARSER_VERSION` and the file's mtime ≤ the recorded one; sync-history skips current
sessions unless `--force`.

**SessionStart catch-up** (`history.ts: catchUp`, `plugin/hooks/hooks.json`): detached, scans
every project dir for files whose session id is **already in the ledger** (so it never uploads
history the user never opted into) and that are not current — a parser bump, an offline
failure (version 0), or lines written after the final Stop hook (its `turn_duration`, the
exit-time `cost-state`). Newest first, capped at 25 per run; the rest follow on later session
starts. Same `shouldSync` gate and tombstone handling as backfill.

**Config writes are merges** (`config.ts: updateConfig`): each writer reloads the file, changes
only its own keys (ledger entries via `recordSynced`, one list entry for untrack, …) and writes
atomically (`<path>.<pid>.tmp` + rename), so a long backfill can't clobber an untrack/pause made
meanwhile. `backfillDirs` also reloads the config per project, so a pause stops it at the next
project. Env-derived `server`/`token` are never persisted; unknown keys are preserved.

`connect.ts` deliberately backfills **only** the current project (not the whole machine) to
avoid a consent surprise / upload spike; it tells the user to run `/claudelens:sync-history`
separately for other projects with history.
