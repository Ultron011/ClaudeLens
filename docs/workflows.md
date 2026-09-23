# Workflows — runnable commands

All commands below were verified against the running repo state (server on :4000, web on :5173, Postgres in Docker on :5544, 37 seeded demo sessions) at the time this doc was written. None of the verification commands below were destructive and none touched the database's rows or killed the running dev servers.

## Dev servers

```bash
pnpm dev            # both server (:4000) and web (:5173) in parallel — web proxies /api to :4000
pnpm dev:server      # server only
pnpm dev:web         # web only
```
Web dev server listens on **5173**, proxies API calls through to the server on **4000**. Both were already running and serving a live demo when this doc was written — confirmed via:
```bash
ss -lptn 'sport = :4000'    # server
ss -lptn 'sport = :5173'    # web
```
**Never kill either with `pkill -f`** — see `docs/gotchas.md`'s environment traps; it can match and kill the agent's own shell. Find the exact PID from `ss` output and kill that PID if a restart is ever needed.

## Database

Postgres 16 runs in Docker, container name **`claudelens-pg`**, mapped to host port **:5544** (`docker-compose.yml`):
```bash
pnpm db:up      # docker compose up -d
pnpm db:down    # docker compose down (keeps the volume)
pnpm db:reset   # docker compose down -v (drops the volume — destructive, do not run against real data)
```

**`rtk psql` does not work on this machine** (no local `psql` binary — confirmed: `rtk: Failed to run psql: Failed to spawn process: No such file or directory (os error 2)`). Use `docker exec` into the container instead:
```bash
docker exec -i claudelens-pg psql -U claudelens -d claudelens -c "select count(*) from sessions;"
# -> 37 (verified while writing this doc)

docker exec -i claudelens-pg psql -U claudelens -d claudelens -c '\d sessions'
docker exec -i claudelens-pg psql -U claudelens -d claudelens -c '\d deletions'
```

## Migrate

```bash
pnpm db:migrate     # pnpm --filter server migrate -> runs SCHEMA then MIGRATIONS (server/src/db.ts) against DATABASE_URL
```
`SCHEMA` is the frozen v1 baseline; every column added since lives in the separate `MIGRATIONS` template literal, applied with `ADD COLUMN IF NOT EXISTS` — safe to re-run (idempotent) against a database that already has rows, including a fresh one. Never add a new column to `SCHEMA` directly — see `docs/architecture.md`'s "drift trap" decision.

## Tests

```bash
pnpm --filter shared test     # -> node --import tsx --test, runs shared/test/parser.test.ts
```
Verified: **19/19 passing** at the time of writing. `shared` is currently the only package with a test suite (no test runner exists for `server`/`web`/`cli` — don't assume `pnpm -r test` does anything meaningful workspace-wide).

**Do not invoke `tsx`/`node --import tsx` directly from the repo root pointed at a file inside a package** — pnpm doesn't hoist dependencies to a root `node_modules`, so `node --import tsx --test shared/test/parser.test.ts` run from the repo root fails with `ERR_MODULE_NOT_FOUND` (confirmed). Always go through `pnpm --filter <package> <script>`, which runs the script with that package's directory as cwd.

## Typecheck

```bash
pnpm typecheck    # pnpm -r typecheck -> tsc --noEmit in shared, cli, web, server
```
Verified clean (`Done` for all 4 workspace packages) at the time of writing.

## Build the plugin bundle

```bash
pnpm plugin:build   # pnpm --filter @claudelens/cli build:plugin
                     # -> esbuild src/cli.ts --bundle --platform=node --format=esm --target=node20
                     #    --outfile=../plugin/dist/claudelens.mjs
```
`plugin/dist/claudelens.mjs` is a **tracked, committed build artifact** (not gitignored) — this is deliberate, not an oversight, because of how the plugin is distributed (see the end-to-end procedure below). Not run destructively here since it overwrites a tracked file outside `docs/`; run it yourself when you've actually changed `cli/src/**`.

## Full end-to-end plugin update procedure

The plugin does **not** run from your local working tree. The install chain is:
```
~/.claude/plugins/marketplaces/claudelens        (git clone of git@github.com:Ultron011/ClaudeLens.git)
   -> version-keyed cache
~/.claude/plugins/cache/claudelens/claudelens/<version>/   (this is what ${CLAUDE_PLUGIN_ROOT} resolves to
                                                             and what actually executes)
```
`/claudelens:update` pulls the marketplace clone, then hot-swaps `dist/`, `skills/`, `hooks/`, `.claude-plugin/` from the freshly-pulled clone into the version-keyed cache directory (see `cli/src/update.ts`). **Nothing reaches a running Claude Code session until it has been pushed to GitHub** — editing files in this repo's working tree has zero effect on any installed plugin until the following full sequence runs:

1. **Server changes first**, if any (`server/src/**`). Deploy/restart the server before touching the client, since the client (CLI/plugin) may depend on new server behavior (e.g. new endpoint fields, new tombstone semantics).
2. **Build the plugin bundle**: `pnpm plugin:build` — regenerates `plugin/dist/claudelens.mjs` from current `cli/src/**`.
3. **Commit, including `plugin/dist`**: this is a tracked artifact — a commit that changes `cli/src/**` but forgets to re-run step 2 and commit the regenerated `.mjs` ships stale plugin code with no build error to catch it.
4. **Push to GitHub**: `git push` — the marketplace clone that `/claudelens:update` pulls from is `git@github.com:Ultron011/ClaudeLens.git`. Nothing before this step is visible to any installed plugin anywhere.
5. **Run `/claudelens:update`** in a Claude Code session — pulls the marketplace clone, hot-swaps the cache directory's `dist/skills/hooks/.claude-plugin`.
6. **Verify**: check the running session picks up the change (e.g. a modified skill's behavior, or `/claudelens:status` reflecting a new field) — an update that silently no-ops (e.g. `findMarketplace()` in `update.ts` failing to locate the clone) prints a message telling you to fall back to `/plugin` → update manually; don't assume success without reading its output.
7. **Backfill**, if the parser's output shape changed (`PARSER_VERSION` bumped): run `/claudelens:sync-history` to re-upload sessions that were parsed under an older `parser_version`, since old rows in Postgres can never be upgraded server-side — the stored `transcript` is `Turn[]`, which doesn't retain enough raw information to recompute new stats fields without re-parsing the original JSONL client-side.

## Seeding demo data for UI work

The dashboard currently holds 37 real seeded sessions from parsing actual local transcripts (not synthetic fixtures) — confirmed via `getStats()`:
```bash
curl -s localhost:4000/api/stats | jq '.totals'
# {"sessions":37,"authors":4,"cost":"2601.64"}
```
To add more realistic demo data for UI work, the pattern used to build the existing 37 is: run the CLI's history-backfill path (`cli/src/history.ts`) against real transcripts already on disk under `~/.claude/projects/*/*.jsonl`, which reuses the exact same `parseTranscript` + upsert path as a live session sync — so seeded data is indistinguishable from organically-synced data. From inside a Claude Code session with the plugin connected, `/claudelens:sync-history` is the user-facing entry point (lists every project under `~/.claude/projects`, lets you pick which to sync, uploads all their past sessions). Do **not** hand-write large synthetic transcript fixtures for seeding the *dashboard* (as opposed to unit-test fixtures, where a small synthetic one is exactly right — see `docs/gotchas.md`'s near-miss about committing a 952 KB real transcript as a *test* fixture, which is the opposite problem: real data landing somewhere it shouldn't, in that case a public git artifact).

## Prod data ops (run inside the app container)

```bash
# Merge one person's author name into another (dry run without --apply). Records an alias so
# future uploads under the old name land on the canonical one.
docker exec -w /app/server claudelens-app-1 node --import tsx src/merge-authors.ts SAURABH Saurabh --apply
# Re-run server-side secret redaction over stored rows (idempotent; dry run without --apply).
docker exec -w /app/server claudelens-app-1 node --import tsx src/redact-existing.ts --apply
```

Backups: `scripts/backup-db.sh` runs nightly from the ubuntu crontab (03:15 UTC) into
`~/backups/claudelens`, 14-day retention, local disk only. Restore / rehearse a migration:
`docker exec -i claudelens-pg pg_restore -U claudelens -d claudelens --clean --if-exists --no-owner < FILE`
(dev DB). Take a fresh backup before any prod data op.
