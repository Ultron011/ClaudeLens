---
description: Show ClaudeLens status — the server, your author name, the Claude profile and plugin version in use, the last sync attempt and its result, server health, and whether the current project/session is tracked or excluded.
---

Read-only. Run and relay the output:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" status --root "${CLAUDE_PLUGIN_ROOT}"
```

It prints the server URL, the Claude config dir in use (`$CLAUDE_CONFIG_DIR`, or
`~/.claude` by default — each Claude Code profile keeps its own transcripts), the
plugin version and root, the ClaudeLens config file (one for every profile), the
author name sessions are attributed to, the signed-in account (email + org) or
why it's unavailable, the local parser version, the global on/paused state, the
**last sync attempt** (time and ok / the error), whether the current directory is
tracked or excluded (and why), any excluded projects/sessions, and server
reachability. If it says "not connected", tell the user to run
`/claudelens:connect <server-url> <token>`.

If the user is asking why their sessions stopped arriving, point at the likely
cause from the output: `PAUSED`, an excluded project, a failed last sync (its
error), a stale plugin version, or a different Claude profile than expected.
