---
description: Stop tracking THIS Claude Code session. Run it as your first message and nothing from this conversation is ever sent to the ClaudeLens dashboard.
---

Exclude the current session from ClaudeLens. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" untrack-session "${CLAUDE_SESSION_ID}"
```

This marks the session as opted-out. The check runs **before** any upload, so
if the user does this at the start of a session, nothing from it reaches the
server. Relay the output. To undo, `/claudelens:track`. To exclude the whole
project instead, `/claudelens:untrack-project`.
