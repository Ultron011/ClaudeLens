# Architecture — end-to-end data flow

See `docs/README.md` for the rules this doc assumes. This doc traces one request through
every layer, then covers the two chains that aren't obvious from reading any single file:
the sync-trigger/re-upload cost, and the plugin install/update path.

## The pipeline

```
Claude Code session
  → Stop hook fires (once per assistant turn)
  → node plugin/dist/claudelens.mjs sync   (cli/src/sync.ts: runSync)
      reads hook stdin {session_id, transcript_path, cwd}
      loadConfig() (cli/src/config.ts) → shouldSync() gate (see below)
      readSettledSession(): parseTranscript() + poll up to 10×250ms until the
        last turn is role:"assistant" (Stop fires before the reply is flushed to disk)
      optional redactDeep() over turns + firstUserPrompt (cfg.redact, default false)
      POST /api/sessions  { session: ParsedSession, author, account?, ... }
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
each `.jsonl` under `~/.claude/projects/<dir>` for `cwd`/`sessionId`, no full parse) and
`sync-history` (full `parseTranscript` + the same POST as live sync, per selected project
dir). Skip logic: `!force && cfg.backfilledSessions.includes(session.sessionId)` — this is a
**plain "ever uploaded" list, not a version ledger**. Note the discrepancy: the parser
bumped `PARSER_VERSION` to 3 (`shared/src/parser.ts`) expecting old sessions to become
re-sync-eligible on a version bump, but `history.ts`'s `backfilledSessions: string[]` has no
version field to compare against — a session backfilled once is skipped forever unless the
caller passes `--force`. (Live `Stop`-hook sync is unaffected by this ledger; it always
re-uploads every turn regardless, so `parser_version` still advances correctly for actively
worked-on sessions — only the backfill skip-list is stale-sync-version-blind.) `saveConfig`
is called after each project directory finishes, so an interrupted bulk backfill doesn't
re-upload everything on retry — only the in-flight project's partial progress is lost.
`connect.ts` deliberately backfills **only** the current project (not the whole machine) to
avoid a consent surprise / upload spike; it tells the user to run `/claudelens:sync-history`
separately for other projects with history.
