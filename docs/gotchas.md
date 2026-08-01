# Gotchas — reusable landmines

Five real bugs hit during the build of identity/auto-mode/analytics, plus near-misses and environment traps. Each bug entry is symptom → root cause → fix → how to avoid, so the "how to avoid" is a rule you can apply elsewhere in this codebase, not a reminder to "be careful."

## 1. Unreferenced bound Postgres parameter → 500 on `/api/analytics`

**Symptom**: `GET /api/analytics` 500s whenever `identity` is omitted (org-wide query).

**Root cause**: the WHERE clause was built with a ternary that dropped `$1` from the SQL text entirely when `identity` was absent, while the query still bound 3 parameters (`pool.query(sql, [identity, from, to])`). node-postgres/Postgres infers a placeholder's type from where it's used in the query text — if `$1` never appears in the text, Postgres can't infer its type and errors before running anything, regardless of what value is bound.

**Fix**: reference `$1` unconditionally, with an explicit cast so its type is never ambiguous even when the bound value is `NULL`:
```sql
($1::text IS NULL OR <identity clause using $1>)
```
Delete the ternary that omitted the clause — always emit it, let the `IS NULL` branch make it a no-op.

**How to avoid**: any time a WHERE clause is built conditionally around an optional filter, every bound parameter index must appear in the SQL text on every code path, cast explicitly. Never let "should I include this clause" decide whether `$N` is *mentioned* — only whether it *matters*.

## 2. `::date` cast + node-postgres + non-UTC server timezone → dates shift by one

**Symptom**: `stats.daily` keys stored as `'2026-07-09'` (a `YYYY-MM-DD` string, always UTC per the parser's contract) came back from a `kv.key::date` cast as `2026-07-08T18:30:00Z` — silently one day off.

**Root cause**: this box's server process runs in UTC+5:30. `::date` in Postgres, combined with how node-postgres deserializes a `date` column/expression back into a JS `Date`, serializes through the **server process's local timezone**, not UTC. A cast that looks like a no-op (`'YYYY-MM-DD'::date` should just be "the same date") instead round-trips through local midnight, breaking the `tz:'UTC'` contract the whole `daily` aggregation depends on (see `docs/claude-code-jsonl.md` and the architecture decision to bucket days in UTC).

**Fix**: don't cast at all. Keep the key as `text` — it is already `YYYY-MM-DD` and needs no date arithmetic in SQL. Do date math (if ever needed) in application code where the timezone is explicit, not via `::date`.

**How to avoid**: never apply `::date` (or any Postgres date/timestamp cast) to a value that is going to be read back through node-postgres on a server whose local timezone isn't UTC, unless you've explicitly verified the round-trip. If a column is already a canonical string in the shape you want, leave it as `text`.

## 3. Unquoted SQL aliases lowercase, leaking snake_case onto a camelCase API

**Symptom**: an API response meant to expose `activeMs` (camelCase, matching the rest of the TS surface) instead had a `active_ms` key.

**Root cause**: `AS active_ms` in the SQL. Postgres folds **unquoted** identifiers to lowercase, and it treats `activeMs` (also unquoted) identically — but if the alias is written with an underscore in the SQL source (`active_ms`), that's exactly what comes back, untouched, because there was no case to fold. The bug isn't folding uppercase→lowercase — it's that the SQL author typed snake_case and Postgres has no way to know the API wants camelCase.

**Fix**: use a **quoted** alias to force the exact case through untouched: `AS "activeMs"`.

**How to avoid**: any SQL alias that needs to match a camelCase TypeScript field name must be double-quoted in the query text. Grep for `AS [a-z_]+_[a-z]` (snake_case aliases) in query strings when a response shape doesn't match what the SQL says.

## 4. `overflow-x: auto` silently creates a scroll container, breaking `position: sticky`

**Symptom**: a sticky `<th>` inside `.table-scroll` never actually sticks against the viewport — it scrolls away with the rest of the page instead of pinning under the topbar.

**Root cause**: per CSS Overflow §3, giving an element any overflow value other than `visible` on one axis (`overflow-x: auto`) forces the *other* axis into a real scroll container too (the spec computes overflow-x/overflow-y as a pair once either is non-`visible`). That scroll container then becomes the **containing block for any `position: sticky` descendant** — sticky no longer sticks to the viewport/nearest scrolling ancestor the page actually scrolls, it sticks to *this* box. Since `.table-scroll` itself is never the thing the user scrolls (the page scrolls; the table just sits in the document flow at normal desktop widths), the sticky header has nothing meaningful to pin against.

**Fix** (see `web/src/styles.extra.css`'s `.table-scroll` comment): don't set `overflow-x: auto` on the wrapper at desktop widths at all. It's only turned on under a `@media (max-width: 720px)` breakpoint, where the tradeoff flips — a pinned first column and horizontal scroll matter more on narrow viewports than a working sticky header, and a table that fits within the viewport width doesn't need to scroll in the first place. Also: `border-collapse: collapse` breaks sticky `<th>` in every current browser engine (the collapsed border box loses its own layout box, so the sticky row visually overlaps the first body row) — use `border-collapse: separate; border-spacing: 0` plus row-level `border-top` instead, to keep the hairline look without the bug.

**How to avoid**: before adding `overflow-x`/`overflow-y: auto|scroll` to any ancestor of a `position: sticky` element, ask whether that ancestor is the box the user will actually scroll. If it isn't (the page itself scrolls), the sticky element's containing block just became wrong. Never pair `border-collapse: collapse` with a sticky `<th>`.

## 5. CSS grid item overflow — `min-width: auto` forces the whole page to scroll horizontally

**Symptom**: adding a wide `DataTable` inside `.layout > .content` (a CSS grid track) made the entire page scroll horizontally, not just the table.

**Root cause**: a grid item's default `min-width` is `auto`, which resolves to its content's max-content size — so a wide table forces its grid track (and therefore the whole `.layout` grid, and the page) to grow past the viewport, instead of the table clipping/scrolling inside its track.

**Fix**: `min-width: 0` on `.layout > .content` (the grid item that holds page content), plus `grid-template-columns: … minmax(0, 1fr)` on any grid track that should behave the same way, plus `min-width: 0` on any cell that needs to truncate with `text-overflow: ellipsis` rather than force its column wider.

**How to avoid**: any time a grid or flex item contains content that might be wider than its track (a table, a long unbreakable string, a `<pre>`), give that item `min-width: 0` explicitly. The default `auto` is almost never what you want once there's overflow-prone content inside.

## 6. `rtk pnpm <script>` prints a FALSE "No errors found"

**Symptom**: `rtk pnpm typecheck` printed `TypeScript: No errors found` while the code had 16 merge-conflict-marker errors. An agent relying on the printed summary would report a clean build on broken code.

**Root cause**: `rtk`'s tsc filter parses raw `tsc` output. `pnpm -r` prefixes every line with the package name (`cli typecheck: src/config.ts(14,1): error TS1185: ...`), so the filter matches nothing and prints its empty-state summary. **The exit code is still correct (2)** — only the human-readable summary is wrong.

**Fix / how to avoid**:
- Gate on the **exit code**, never on rtk's printed text: `pnpm typecheck; echo "exit=$?"` — or just use raw `pnpm typecheck`.
- `rtk tsc --noEmit` run *inside a package dir* is accurate (it sees raw tsc output). It's specifically `rtk` wrapping a **pnpm recursive script** that misreports.
- Treat this as general: rtk filters are output *parsers*. Any command whose output format they don't recognise can produce a confident-but-wrong summary. **Exit codes are the source of truth.**

Verified facts:
- `rtk pnpm typecheck` → prints "No errors found", exit=2
- `pnpm typecheck` → prints 16 `TS1185` errors, exit=2
- `rtk tsc --noEmit` in `cli/` → prints "TypeScript: 16 errors in 1 files", correct

## 7. Committed merge-conflict markers

**Symptom**: `esbuild` failed with `Unexpected "<<"` at `cli/src/config.ts:14`.

**Root cause**: a `git stash pop` conflict was **committed with markers unresolved** (diff3 style: `<<<<<<< Updated upstream` / `||||||| Stash base` / `=======` / `>>>>>>> Stashed changes`). Restoring files from that commit reintroduced the markers.

**Fix / how to avoid**: before trusting any `git checkout <commit> -- <paths>` recovery, run:
```
grep -rn "^<<<<<<<\|^|||||||\|^>>>>>>>" <restored paths>
```
This must print nothing. Add it to the verification list after any git-based file recovery.

**Context for this repo**: the correct resolution was to keep the "Stashed changes" side (the newer `backfilled: Record<string, number>` + `shareAccount` fields), because `cli/src/history.ts` and `cli/src/sync.ts` already reference them.

---

## Near-misses worth documenting

- **A subagent reported "all 6 checks passed" having only exercised the `identity=` code path** — i.e., it never actually hit bug 1's org-wide (`identity` omitted) branch, so the 500 shipped past a green report. Lesson: a "passed" report from a subagent describes what it *ran*, not what it *covered* — check which branches/parameter combinations were actually exercised, especially the omitted/default/empty case of any optional filter.

- **Tests named for behaviour they never asserted.** Three tests had names implying they checked specific logic, but passed even with that logic's implementation deleted — they were asserting something weaker (e.g. "is non-empty") than their name claimed. Caught by **mutation testing**: comment out each clause/branch under test one at a time, confirm that *exactly* the test(s) whose name references that clause fail (and no others), then restore the clause. If commenting out a clause doesn't fail the test that's supposedly protecting it, the test isn't testing what it says.

- **A 952 KB real Claude Code transcript was committed as a test fixture.** `plugin/dist` (and, by extension, anything checked in near it) is a **tracked** artifact that ships to everyone via `git clone` (see `docs/workflows.md`'s plugin-update procedure) — a real transcript fixture would have published the author's actual session content, including anything Claude Code recorded during that session, to every user of the plugin. Fixed by replacing it with a 12-line **synthetic** fixture (`shared/test/fixture.jsonl`), which also happened to let tests assert exact values instead of "is non-empty" — a fixture built for the property you're testing beats a captured real one both for privacy and for test precision. **Never commit a real `~/.claude/projects/**/*.jsonl` transcript as a fixture** — hand-write or heavily redact one instead.

## Environment traps (this machine)

- **`rtk psql` does not work here** — there is no local `psql` binary, so the wrapper fails with `Failed to spawn process: No such file or directory`. Use `docker exec -i claudelens-pg psql -U claudelens -d claudelens -c "…"` instead (verified working; see `docs/workflows.md`).
- **Never `pkill -f`** to kill a dev server or stray process. It pattern-matches process command lines, and has been observed to match and kill the **agent's own shell**, ending the session. Find the PID for a specific port with `ss -lptn 'sport = :4000'` (or `:5173`, `:5544`) and kill that PID specifically.
- **`tsx` resolves from package directories, not the repo root** — pnpm's workspace layout doesn't hoist dependencies to a root `node_modules` the way npm/yarn classic do. Confirmed: `node --import tsx --test shared/test/parser.test.ts` run from the repo root fails with `ERR_MODULE_NOT_FOUND`; the same test passes when invoked as `pnpm --filter shared test` (which runs the `node --import tsx --test` script with `shared/` as the working directory). Always run package scripts via `pnpm --filter <pkg> <script>`, never by pointing a root-level `tsx`/`node` invocation at a file path inside a package.
- **`ls` is aliased to `eza` on this machine** — passing a path can fail with `invalid value ... for '--icons'`. Use `find` in scripts.
- **`cfg.server` from `~/.claude/claudelens.json` takes precedence over the `CLAUDELENS_SERVER` env var** (`config.ts:77`). To point the CLI at a test server you must override `HOME` (config lives at `join(homedir(), '.claude', 'claudelens.json')`) — and if you also need account identity, set `CLAUDE_CONFIG_DIR` to the real home, since `account.ts` reads `$CLAUDE_CONFIG_DIR/.claude.json` separately.
