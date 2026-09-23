---
description: Print the ClaudeLens dashboard link for THIS session.
---

Look up the current session's dashboard URL:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" link --session "${CLAUDE_SESSION_ID}"
```

If the session hasn't reached the dashboard yet, the command syncs it first and
retries; an untracked session is never uploaded — it says so instead. Relay the
output (the link) as-is.
