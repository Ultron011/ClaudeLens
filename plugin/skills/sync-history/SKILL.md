---
description: Backfill history from before ClaudeLens was installed. Lists every project under ~/.claude/projects, lets you pick which to sync, then uploads all their past sessions to the dashboard.
---

This is a two-step, chat-driven flow — there is no interactive terminal picker,
so selection happens by you listing numbers in the conversation.

**Step 1 — list.** Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" list-projects
```

This prints a JSON array of every project found under `~/.claude/projects`, each
with `index`, `cwd` (the real project path), `sessions` (total session count),
`synced` (how many were already backfilled previously), and `lastActivity`.

Render this as a compact numbered list for the user, e.g.:

```
1. /home/soul/projects/ClaudeLens — 42 sessions (5 already synced), last active 2026-07-20
2. /home/soul/projects/other-repo — 8 sessions (0 already synced), last active 2026-06-01
```

If the list is empty, say so and stop — there's nothing to backfill.

**Step 2 — ask.** Ask the user which project(s) to sync: specific numbers
(comma-separated), or "all". Wait for their reply before running anything that
uploads data — do not guess.

**Step 3 — sync.** Run exactly one command with their selection, using the
`index` values from step 1 (or `--all`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" sync-history <index> [<index> ...]
```

or, for everything:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" sync-history --all
```

Sessions already backfilled in a previous run are skipped automatically. If the
user explicitly wants to re-upload everything (e.g. after fixing redaction
settings), add `--force`.

Relay the final summary line (synced / skipped / failed counts) to the user.
Everything uploaded here follows the same tracking rules as live sync — paused,
excluded, or `.claudelens`-marked projects are skipped even if selected.
