---
description: Show ClaudeLens status — the server, your author name, server health, and whether the current project/session is tracked or excluded.
---

Read-only. Run and relay the output:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" status
```

It prints the server URL, the author name sessions are attributed to, the global
on/paused state, whether the current directory is tracked or excluded (and why),
any excluded projects/sessions, and server reachability. If it says "not
connected", tell the user to run `/claudelens:connect <server-url> <token>`.
