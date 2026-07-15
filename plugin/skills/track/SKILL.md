---
description: Resume tracking THIS session after you excluded it with /claudelens:untrack.
---

Re-enable ClaudeLens for the current session:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" track-session "${CLAUDE_SESSION_ID}"
```

Relay the output. It syncs again from the next turn on.
