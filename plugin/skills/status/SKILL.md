---
description: Show ClaudeLens status — your name, server, token, server health, and which projects are tracked vs excluded.
---

Show the user their current ClaudeLens configuration. This one is read-only and
non-interactive, so run it and relay the output:

```
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" status
```

It prints the configured name, server URL, whether a token is set, whether the
server is reachable, and the tracked/excluded status of every project. If it
reports "not set up", tell the user to run `claudelens setup` in their terminal.
